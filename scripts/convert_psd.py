import re
from psd_tools import PSDImage
from PIL import Image
import os
import numpy as np
from psd_tools.psd.engine_data import List
import math
from collections import Counter
import cv2
from math import isclose
import sys
import zipfile
import tempfile
import shutil
import json
import warnings
import base64

def log_to_stderr(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)  # Use print directly, no recursion

def convert_psd_to_html(zip_path):
    if not zip_path.lower().endswith('.zip'):
        return {"success": False, "error": "Input file must be a ZIP file"}

    if not os.path.exists(zip_path):
        return {"success": False, "error": f"File not found: {zip_path}"}

    results = {}
    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract the ZIP file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)

        # Find all PSD files in the extracted directory
        psd_files = [f for f in os.listdir(temp_dir) if f.lower().endswith('.psd')]
        if not psd_files:
            return {"success": False, "error": "No PSD files found in the ZIP"}


        # Suppress warnings from psd_tools and redirect to stderr
        warnings.filterwarnings("always", category=UserWarning)
        def warn_with_stderr(message, category, filename, lineno, file=None, line=None):
            log_to_stderr(f"{filename}:{lineno}: {category.__name__}: {message}")

        warnings.showwarning = warn_with_stderr


        def sanitize_filename(filename):
            """Sanitize layer names to be valid filenames."""
            return re.sub(r'[<>:"/\\|?*]', '_', filename)

        def get_better_color(layer):
            if layer.name == "cta" and layer.is_group() or layer.name == "contactWrap" and layer.is_group():
                try:
                    for rect in layer:
                        if rect.kind == "shape":
                            image = rect.topil()
                            pixels = list(image.getdata())
                            most_common_color = Counter(pixels).most_common(1)[0][0]
                            return most_common_color
                        elif getattr(rect, "kind", None) == "pixel" or hasattr(rect, "getpixel"):
                            if hasattr(rect , "topil"):  # Ensure it can be converted
                                image = rect.topil().convert("RGB")
                                pixels = list(image.getdata())
                                if pixels:
                                    return Counter(pixels).most_common(1)[0][0]



                except Exception as e:
                    return None            

        def shape_better_color(layer):
            if not layer.name.startswith("shape"):
                return None
            try:
                if getattr(layer, "kind", None) in ("shape", "pixel") or hasattr(layer, "getpixel"):
                    if hasattr(layer, "topil"):
                        image = layer.topil().convert("RGBA")
                        pixels = list(image.getdata())
                        
                        if not pixels:
                            log_to_stderr(f"Layer '{layer.name}' has no pixel data.")
                            return None
                        opaque_pixels = [p for p in pixels if p[3] > 0] 
                        if not opaque_pixels:
                            log_to_stderr(f"Layer '{layer.name}' has only transparent pixels: {pixels[:5]}")
                            return None
                        most_common_color = Counter(opaque_pixels).most_common(1)[0][0]
                        log_to_stderr(f"Most common color in '{layer.name}'")
                        return most_common_color

                    else:
                        raise ValueError("Layer lacks 'topil' method")
                else:
                    raise ValueError("Unsupported layer kind")

            except Exception as e:
                log_to_stderr(f"Error processing layer '{layer.name}': {str(e)}")
                return None


        def get_layer_color(layer):
            try:
                if layer.name == "bg" or layer.name == "shape 1" or layer.name == "shape1":
                    if layer.is_group():
                        return None 


                    if hasattr(layer, 'is_shape') and layer.is_shape():
                        try:
                            color = layer.fill_color
                            if color:
                                return color 
                        except AttributeError:
                            return None  

                    image = layer.composite()
                    image = image.convert("RGB")
                    np_image = np.array(image)

                    avg_color = np.mean(np_image, axis=(0, 1)) 
                    return tuple(map(int, avg_color))
            except Exception as e:
                return None        


        def get_text_layer_dimensions(layer):
            if layer.kind == 'type': 
                tx1, ty1, tx2, ty2 = layer.bbox
                width, height = tx2 - tx1, ty2 - ty1 
                return width, height, tx1, ty1
            return None, None, None, None


        def create_shapes(image_path):
            try:
                image = cv2.imread(image_path)
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                            cv2.THRESH_BINARY, 11, 2)
                edges = cv2.Canny(edges, 50, 150)
                
                kernel = np.ones((3, 3), np.uint8)
                edges = cv2.dilate(edges, kernel, iterations=1)
                
                contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                clip_paths = []
                for i, contour in enumerate(contours, 1):
                    area = cv2.contourArea(contour)
                    perimeter = cv2.arcLength(contour, True)
                    if area < 500: 
                        continue

                    epsilon = 0.015 * perimeter 
                    approx = cv2.approxPolyDP(contour, epsilon, True)
                    sides = len(approx)

                    # log_to_stderr(f"Contour {i}: Area={area}, Perimeter={perimeter}, Sides={sides}") done

                    shape = "Unknown"
                    clip_path = ""

                    if sides == 3:
                        x, y, w, h = cv2.boundingRect(contour)
                        aspect_ratio = w / h if h != 0 else 1
                        if aspect_ratio < 0.5: 
                            shape = "Slanted Triangle"
                        else:
                            shape = "Triangle"
                        clip_path = "polygon(" + ", ".join(f"{p[0][0]}px {p[0][1]}px" for p in approx) + ")"

                    elif sides == 4:
                        shape = "Rectangle"
                        clip_path = "polygon(" + ", ".join(f"{p[0][0]}px {p[0][1]}px" for p in approx) + ")"

                    elif sides > 8:
                        (center, axes, angle) = cv2.fitEllipse(contour)
                        aspect_ratio = axes[0] / axes[1] if axes[1] != 0 else 1
                        if 0.95 <= aspect_ratio <= 1.05:
                            shape = "Circle"
                            clip_path = f"circle({axes[0]/2:.1f}px at {center[0]:.1f}px {center[1]:.1f}px)"
                        else:
                            shape = "Ellipse"
                            num_points = 100
                            ellipse_points = []
                            angle_rad = math.radians(angle)
                            cos_angle = math.cos(angle_rad)
                            sin_angle = math.sin(angle_rad)
                            a, b = axes[0] / 2, axes[1] / 2
                            cx, cy = center

                            for t in range(num_points):
                                theta = 2 * math.pi * t / num_points
                                x = cx + a * math.cos(theta) * cos_angle - b * math.sin(theta) * sin_angle
                                y = cy + a * math.cos(theta) * sin_angle + b * math.sin(theta) * cos_angle
                                ellipse_points.append(f"{x:.2f}px {y:.2f}px")

                            clip_path = "polygon(" + ", ".join(ellipse_points) + ")"
                    else:
                        shape = f"Polygon with {sides} sides"
                        clip_path = "polygon(" + ", ".join(f"{p[0][0]}px {p[0][1]}px" for p in approx) + ")"

                    log_to_stderr(f"Processed: Shape {i} - {shape}")
                    clip_paths.append(clip_path.strip("[]'"))
                    cv2.drawContours(image, [approx], -1, (0, 255, 0), 2)

                return clip_paths[0] if clip_paths else None
            except Exception as e:
                log_to_stderr(f"Error in create_shapes for {image_path}: {e}")
                return None




        def image_clip_path_generate(image_path, child_layer):
            try:
                image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
                if image is None:
                    raise FileNotFoundError(f"cv2.imread failed to load {image_path}")

                if image.shape[2] == 4:
                    b, g, r, alpha = cv2.split(image)
                    gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)

                    if gray.min() == gray.max():
                        log_to_stderr("Grayscale is uniform, using alpha channel or enhancing contrast")
                        if alpha.min() != alpha.max():
                            gray = alpha
                        else:
                            gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

                gray = cv2.GaussianBlur(gray, (3, 3), 0)
                log_to_stderr(f"Applied Gaussian blur to grayscale")

                edges = cv2.Canny(gray, 10, 50)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                edges = cv2.dilate(edges, kernel, iterations=1)
                edges = cv2.erode(edges, kernel, iterations=1)
                cv2.imwrite(f"output/{file_name_t}/images/{child_layer.name}_edges.png", edges)

                contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                log_to_stderr(f"Found {len(contours)} contours")

                if not contours:
                    log_to_stderr(f"No contours found. Check saved edges image: {child_layer.name}_edges.png")
                else:
                    for i, contour in enumerate(contours, 1):
                        epsilon = 0.005 * cv2.arcLength(contour, True) 
                        approx = cv2.approxPolyDP(contour, epsilon, True)
                        sides = len(approx)
                        
                        area = cv2.contourArea(contour)
                        if area < 100:
                            log_to_stderr(f"Skipping contour {i} (area < 100)")
                            continue

                        if len(contour) >= 5:
                            ellipse = cv2.fitEllipse(contour)
                            (center, axes, angle) = ellipse
                            aspect_ratio = axes[0] / axes[1] if axes[1] != 0 else 1
                            
                            if sides == 3:
                                shape = "Triangle"
                                clip_path = "polygon(" + ", ".join(f"{p[0][0]:.1f}px {p[0][1]:.1f}px" for p in approx) + ")"
                            elif sides == 4:
                                shape = "Rectangle"
                                clip_path = "polygon(" + ", ".join(f"{p[0][0]:.1f}px {p[0][1]:.1f}px" for p in approx) + ")"
                            elif sides > 8 and 0.95 <= aspect_ratio <= 1.05:
                                shape = "Circle"
                                clip_path = f"circle({axes[0]/2:.1f}px at {center[0]:.1f}px {center[1]:.1f}px)"
                            elif sides > 6 and (aspect_ratio < 0.95 or aspect_ratio > 1.05):
                                shape = "Ellipse"
                                num_points = 256 
                                ellipse_points = []
                                angle_rad = math.radians(angle)
                                cos_angle = math.cos(angle_rad)
                                sin_angle = math.sin(angle_rad)
                                a = axes[0] / 2  
                                b = axes[1] / 2  
                                cx, cy = center

                                for t in range(num_points):
                                    theta = 2 * math.pi * t / num_points
                                    x = cx + a * math.cos(theta) * cos_angle - b * math.sin(theta) * sin_angle
                                    y = cy + a * math.cos(theta) * sin_angle + b * math.sin(theta) * cos_angle
                                    ellipse_points.append(f"{x:.1f}px {y:.1f}px")
                                
                                clip_path = "polygon(" + ", ".join(ellipse_points) + ")"
                                css_ellipse = f"ellipse({a:.1f}px {b:.1f}px at {cx:.1f}px {cy:.1f}px) rotate({angle:.1f}deg)"
                            else:
                                shape = f"Polygon with {sides} sides"
                                clip_path = "polygon(" + ", ".join(f"{p[0][0]:.1f}px {p[0][1]:.1f}px" for p in approx) + ")"
                        else:
                            shape = f"Polygon with {sides} sides"
                            clip_path = "polygon(" + ", ".join(f"{p[0][0]:.1f}px {p[0][1]:.1f}px" for p in approx) + ")"
                        log_to_stderr(f"Contour {i}: Shape type = {shape}")
                        if shape == "Rectangle":
                            file_path_r = [
                                image_path,
                                f"output/{file_name_t}/images/{child_layer.name}_edges.png"
                            ]
                            for path_r in file_path_r:
                                if os.path.exists(path_r):
                                    os.remove(path_r)
                            return None

                        if shape == "Ellipse":
                            log_to_stderr(f"CSS Ellipse Alternative: {css_ellipse}")
                        log_to_stderr(f"Processed: Shape {i}, Clip-path:")
                        
                        cv2.drawContours(image, [approx], -1, (0, 255, 0), 2)
                        if 'ellipse' in locals():
                            cv2.ellipse(image, ellipse, (255, 0, 0), 2)
                    cv2.imwrite(f"output/{file_name_t}/images/{child_layer.name}_contours.png", image)
                    log_to_stderr(f"Saved annotated image: {child_layer.name}_contours.png")
                    file_path_r = [
                        image_path,
                        f"output/{file_name_t}/images/{child_layer.name}_edges.png",
                        f"output/{file_name_t}/images/{child_layer.name}_contours.png"   
                    ] 
                    for path_r in file_path_r:
                        os.remove(path_r)
                    return clip_path
            except Exception as e:
                log_to_stderr(f"Error in create_shapes for {image_path}: {e}")
 


        def rgba_to_rgb(rgba_values):
            if not rgba_values or len(rgba_values) < 3:
                return None
            r = int(rgba_values[1] * 255)
            g = int(rgba_values[2] * 255)
            b = int(rgba_values[3] * 255)
            return (r, g, b)

        def extract_font_weight(font_name):
            font_weights = {
                'Thin': '100',
                'ExtraLight': '200',
                'Light': '300',
                'Regular': '400',
                'Normal': '400',
                'Medium': '500',
                'SemiBold': '600',
                'Bold': '700',
                'ExtraBold': '800',
                'Black': '900',
            }

            font_name = font_name.strip().strip("'\"")
            font_name = font_name.replace("\xa0", " ")
            font_name = font_name.encode("ascii", "ignore").decode()
            
            match = re.match(r'^(.*?)[-_ ]?(Thin|ExtraLight|Light|Regular|Normal|Medium|SemiBold|Bold|ExtraBold|Black)?(Italic)?$', font_name, re.IGNORECASE)
            if match:
                font_family = match.group(1).replace("Roman", "").strip()
                fontWt = match.group(2) if match.group(2) else "Regular"
                italic_w = match.group(3) if match.group(3) else "normal"
                italic_wd = italic_w.lower() 
            else:
                font_family = font_name
                fontWt = "Regular"
            
            fontWt = fontWt[0].upper() + fontWt[1:] if fontWt.lower() != "regular" else "Regular"
            fontGetWeight = font_weights.get(fontWt, '400')
            return font_family, fontWt, fontGetWeight, italic_wd


        
        def broder_radius_get(shape, child_layer):
            radii = getattr(shape, 'radii', None)
            if radii:
                # log_to_stderr(f"child_layer '{child_layer.name}' has border radius: {radii}")
                top_left = radii.get(b'topLeft', 0.0)
                top_right = radii.get(b'topRight', 0.0)
                bottom_right = radii.get(b'bottomRight', 0.0)
                bottom_left = radii.get(b'bottomLeft', 0.0)
                
                border_radius = f"{top_left}px {top_right}px {bottom_right}px {bottom_left}px"
                return border_radius
            else:
                log_to_stderr(f"child_layer '{child_layer.name}' is a rounded rectangle but no radius defined.")
                return None


        for psd_file in psd_files:  
            psd_path = os.path.join(temp_dir, psd_file)
            psd = PSDImage.open(psd_path)
            file_name_t = os.path.splitext(psd_file)[0]
            width_meta, height_meta = psd.width, psd.height

            need_valid_sizes = [(300, 600), (320, 520), (160, 600)]
            width_contain = None
            width_psd, height_psd = psd.width, psd.height

            output_dir = f"output/{file_name_t}"
            os.makedirs(f"{output_dir}/images", exist_ok=True)
            os.makedirs(f"{output_dir}/css", exist_ok=True)

            sequenceOrder_layer = {
                "mainHeading": [],
                "subHeading": [],
                "offer": [],
                "cta": [],
                "contactWrap": []
            }
            outerSection = {
                "logo": [],
                "mainImages": [],
                "shapes": []
            }
            extracted_values = {}

            def process_layer(layer, html_content, css_content, content_html_app):

                image = layer.composite()
                sanitized_name = sanitize_filename(layer.name)
                    
                x1, y1, x2, y2 = layer.bbox
                width = x2 - x1
                height = y2 - y1
                global xe2, ye2, logo_width, logo_height, logo_x, logo_y
                checkHtmlContactWrap = checkAppendContactWrap = 1
                shapeCounts = 1
                cnt = cnt2 = 0
                counter_hero2 = 1
                imageLayer = f"sd_img_Image"
                """Process individual layers and generate HTML/CSS."""
                if not layer.is_group() and layer.composite():
                    logo_processed = False
                    if "logoArea" in layer.name and not logo_processed:
                        logo_width, logo_height = width, height
                        logo_x, logo_y = x1, y1
                        return

                    if "logo" in layer.name:
                        if (width_psd, height_psd) in need_valid_sizes:
                            logo_adjust = "center"
                        else: 
                            logo_adjust = "flex-start"
                            
                        image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                        if cnt == 0:
                            try:
                                image.save(image_path)
                                log_to_stderr(f"Saved image for {layer.name} at {image_path}")
                                extracted_values['logo_path'] = image_path
                            except Exception as e:
                                log_to_stderr(f"Failed to save image for {layer.name}: {e}")
                            outerSection["logo"].append(f'<div class="logo">')
                            outerSection["logo"].append(f'<img src="images/{sanitized_name}.png" alt="logo" id="sd_img_Logo"/>')
                            outerSection["logo"].append('</div>')
                            css_content.append(f"""
                            .logo {{
                                width: {logo_width -3}px;
                                height: {logo_height - 3}px;
                                position: absolute;
                                left: {logo_x}px;
                                top: {logo_y}px;
                                display: flex;
                                align-items: center;
                                justify-content: {logo_adjust};
                            }}
                            .logo img{{
                                max-width: {logo_width -3}px;
                                max-height: {logo_height - 3}px;
                            }}
                            """)
                            logo_processed = True
                            log_to_stderr(f"Processed Logo: {sanitized_name}")


                    shape_names = ["shape 1", "shape 2", "shape 3", "shape 4", "shape 5", "shape 6"]
                    for name in shape_names:
                        if name in layer.name:
                            outerSection["shapes"].append(f'<div class="shape{shapeCounts} animate_fadeIn delay_0s" id="sd_bgcolor_Shape-{shapeCounts}">')
                            outerSection["shapes"].append('</div>')
                            ShapeColor = shape_better_color(layer)
                            border_radius_shape = "initial"
                            clip_path = None
                            if layer.kind == "shape" or hasattr(layer, 'smart_object'):
                                layer_image = layer.composite()
                                image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                                layer_image.save(image_path)
                                log_to_stderr(f"Saved shape layer to: {image_path}")
                                # if layer.kind == 'shape' and hasattr(layer, 'vector_mask'):
                                if layer.origination:
                                    for shape in layer.origination:
                                        if 'RoundedRectangle' in str(shape):
                                            border_radius_shape = broder_radius_get(shape, layer)
                                        else:
                                            clip_path = create_shapes(image_path)

                                os.remove(image_path)
                                # cv2.imwrite('output_image.jpg', image)
                                # cv2.waitKey(0)
                                # cv2.destroyAllWindows()
                            # else:
                            #     clip_path = "inherit"

                                    
                            # layer_image = layer.composite()
                            # image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                            # layer_image.save(image_path)
                            # log_to_stderr(f"Saved shape layer to: {image_path}")

                            # def extract_clip_path(image_path):
                            #     image = cv2.imread(image_path)
                            #     if image is None:
                            #         log_to_stderr(f"Error: Could not load image at {image_path}")
                            #         return None

                            #     height, width = image.shape[:2]
                            #     gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                            #     gray = cv2.GaussianBlur(gray, (5, 5), 0)
                            #     median_intensity = np.median(gray)
                            #     lower_threshold = int(max(0, 0.66 * median_intensity))
                            #     upper_threshold = int(min(255, 1.33 * median_intensity))
                            #     edges = cv2.Canny(gray, lower_threshold, upper_threshold)
                            #     contours, _ = cv2.findContours(edges.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                            #     padding_x = int(width * 0.05)
                            #     padding_y = int(height * 0.05)

                            #     if contours:
                            #         largest_contour = max(contours, key=cv2.contourArea)
                            #         x, y, w, h = cv2.boundingRect(largest_contour)

                            #         aspect_ratio = w / float(h)
                            #         area = cv2.contourArea(largest_contour)
                            #         rect_area = w * h
                            #         extent = area / float(rect_area)

                            #         if len(largest_contour) >= 5: 
                            #             ellipse = cv2.fitEllipse(largest_contour)
                            #             (center_x, center_y), (axis1, axis2), angle = ellipse
                            #             circle_check = abs(axis1 - axis2) / max(axis1, axis2) < 0.1 
                            #         else:
                            #             circle_check = False

                            #         if circle_check:
                            #             radius = int(min(axis1, axis2) / 2)
                            #             clip_path = f'circle({int(center_x)}px {int(center_y)}px at {radius}px)'
                            #         elif 0.9 < extent < 1.1:
                            #             clip_path = f'polygon({x}px {y}px, {x + w}px {y}px, {x + w}px {y + h}px, {x}px {y + h}px)'
                            #         else:
                            #             epsilon = 0.01 * cv2.arcLength(largest_contour, True)
                            #             approx = cv2.approxPolyDP(largest_contour, epsilon, True)
                            #             clip_path = 'polygon(' + ', '.join(f'{point[0][0]}px {point[0][1]}px' for point in approx) + ')'
                            #     else:

                            #         log_to_stderr('No contours found. Using padded rectangular clip-path.')
                            #         clip_path = f'polygon({padding_x}px {padding_y}px, {width - padding_x}px {padding_y}px, {width - padding_x}px {height - padding_y}px, {padding_x}px {height - padding_y}px)'

                            #     cv2.imwrite('edges_debug.jpg', edges)
                            #     log_to_stderr('Edge image saved as edges_debug.jpg for debugging')

                            #     os.remove(image_path)
                            #     log_to_stderr(f'CSS clip-path: {clip_path}')
                            #     return clip_path
                                
                            # getRightPath = extract_clip_path(image_path)    
                            # log_to_stderr(f"here is right path of shape: {getRightPath}")



                            # doc_width = psd.width
                            # doc_height = psd.height
                            # log_to_stderr(f"PSD size: {doc_width}x{doc_height}px")

                            # def get_shape_points(layer):
                            #     if layer.kind == 'shape' and hasattr(layer, 'vector_mask') and layer.vector_mask is not None:
                            #         # Get bounding box
                            #         bbox = layer.bbox
                            #         bbox_left, bbox_top, bbox_right, bbox_bottom = bbox
                            #         bbox_width = bbox_right - bbox_left
                            #         bbox_height = bbox_bottom - bbox_top
                            #         log_to_stderr(f"Layer bbox: left={bbox_left}, top={bbox_top}, width={bbox_width}, height={bbox_height}")

                            #         # Get vector mask points
                            #         vector_mask = layer.vector_mask
                            #         raw_points = [(knot.anchor[0], knot.anchor[1]) for path in vector_mask.paths for knot in path]
                            #         log_to_stderr("Raw points:", raw_points)

                            #         # Stretch X to full bbox width
                            #         min_x_raw = min(x for x, _ in raw_points)
                            #         max_x_raw = max(x for x, _ in raw_points)
                            #         x_range_raw = max_x_raw - min_x_raw

                            #         points = []
                            #         for x, y in raw_points:
                            #             # Stretch X to full width
                            #             scaled_x = bbox_left + ((x - min_x_raw) / x_range_raw) * bbox_width
                            #             # Y: 0 at top (103), 1 at bottom (276)
                            #             scaled_y = bbox_top + (y * bbox_height)
                            #             points.append((scaled_x, scaled_y))
                                    
                            #         log_to_stderr("Scaled points:", points)

                            #         # For "shape 1", manually adjust to match the image (wider at bottom)
                            #         if layer.name == "shape 1":
                            #             # Current points: wider at top, need wider at bottom
                            #             # Reinterpret points based on image
                            #             # From image: top narrower, bottom wider
                            #             top_left_x = bbox_left + ((0.3416 - min_x_raw) / x_range_raw) * bbox_width  # Was at Y=1 (bottom)
                            #             top_right_x = bbox_left + ((0.1749 - min_x_raw) / x_range_raw) * bbox_width  # Was at Y=1 (bottom)
                            #             bottom_left_x = bbox_left  # Was at Y=0 (top)
                            #             bottom_right_x = bbox_right  # Was at Y=0 (top)
                            #             points = [
                            #                 (top_left_x, bbox_top),      # Top-left
                            #                 (bottom_left_x, bbox_bottom), # Bottom-left
                            #                 (bottom_right_x, bbox_bottom), # Bottom-right
                            #                 (top_right_x, bbox_top)      # Top-right
                            #             ]
                            #             log_to_stderr("Adjusted points for shape 1:", points)

                            #         return points
                            #     return None

                            # def points_to_clip_path(points):
                            #     clip_path = "polygon(" + ", ".join(f"{x:.2f}px {y:.2f}px" for x, y in points) + ")"
                            #     return clip_path

                            # # Process all layers
                            # points = get_shape_points(layer)
                            # if points:
                            #     log_to_stderr(f"\nLayer: {layer.name}")
                            #     log_to_stderr("Final points:", points)
                            #     clip_path = points_to_clip_path(points)
                            #     log_to_stderr("CSS clip-path:", clip_path)
                            #     min_x = min(p[0] for p in points)
                            #     max_x = max(p[0] for p in points)
                            #     log_to_stderr(f"Shape width: {max_x - min_x:.2f}px")
                            # # Try bounding box if vector mask isn't right
                            # log_to_stderr("\nUsing bounding box:")
                            # points = get_shape_points(layer)
                            # if points:
                            #     log_to_stderr(f"Layer: {layer.name}")
                            #     log_to_stderr("Scaled points:", points)
                            #     clip_path = points_to_clip_path(points)
                            #     log_to_stderr("CSS clip-path:", clip_path)
                            #     min_x = min(p[0] for p in points)
                            #     max_x = max(p[0] for p in points)
                            #     log_to_stderr(f"Shape width: {max_x - min_x:.2f}px")

                            css_content.append(f"""
                            .shape{shapeCounts} {{
                                width: {width - 1 }px;
                                height: {height - 1}px;
                                position: absolute;
                                left: {x1}px;
                                top: {y1}px;
                                background-color: rgb{ShapeColor};
                                border-radius: {border_radius_shape};
                                clip-path: {clip_path};
                                -webkit-clip-path: {clip_path}
                            
                            }}
                                        """)

                        shapeCounts += 1



                    if "contentArea" in layer.name:
                        xe2, ye2 = x1, y1
                        css_content.append(f"""
                        .contentSection {{
                            width: {width}px;
                            height: {height}px;
                            position: relative;
                            left: {xe2}px;
                            top: {ye2}px;
                            overflow: hidden;
                        }}
                                    """)
                    # else:
                    #     xe2, ye2
                    # elif "imageHero1" in layer.name:
                    #     image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                    #     try:
                    #         image.save(image_path)
                    #         log_to_stderr(f"Saved image for {layer.name} at {image_path}")
                    #     except Exception as e:
                    #         log_to_stderr(f"Failed to save image for {layer.name}: {e}")
                    # elif "imageHero2" in layer.name:
                    #     image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                    #     try:
                    #         image.save(image_path)
                    #         log_to_stderr(f"Saved image for {layer.name} at {image_path}")
                    #     except Exception as e:
                    #         log_to_stderr(f"Failed to save image for {layer.name}: {e}")
                    # elif "imageHero3" in layer.name:
                    #     image_path = f"output/{file_name_t}/images/{sanitized_name}.png"
                    #     try:
                    #         image.save(image_path)
                    #         log_to_stderr(f"Saved image for {layer.name} at {image_path}")
                    #     except Exception as e:
                    #         log_to_stderr(f"Failed to save image for {layer.name}: {e}")        

                    log_to_stderr(f"Processed: {sanitized_name}")
                
                elif layer.is_group():
                    incre = cSubheading = 1
                    animateCr = 4
                    HeroAnimateOne = 0
                    HeroAnimateTwo = 0
                    animateCrOut = 7
                    countersOne = 1
                    countersTwo = 1
                    idxImageTwo = idxImageOne = 1
                    log_to_stderr(f"Skipping group: {layer.name}")
                    for pp in reversed(layer):
                        # if layer.kind == "shape":
                        #     continue
                        if hasattr(pp, 'kind') and pp.kind == 'type':
                            log_to_stderr(f"Text layer found: {pp.name}")
                            if hasattr(pp, 'text') and pp.text:
                                text_content = pp.text.replace('', ' ')
                                log_to_stderr(f"Text content found: {text_content}")
                                if hasattr(pp, 'engine_dict'):
                                    engine_data = pp.engine_dict
                                    if hasattr(pp, 'transform'):
                                        transform_matrix = pp.transform
                                    try:
                                        if 'StyleRun' in engine_data:
                                            font_size = engine_data['StyleRun'].get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('FontSize', 'Font size not available')
                                            scaling_factor_x = transform_matrix[0]
                                            scaling_factor_y = transform_matrix[3]
                                            font_size_points = font_size
                                            dpi = 72
                                            font_size_pixels = font_size_points * (dpi / 72)
                                            scaled_font_size_x = font_size_pixels * scaling_factor_x
                                            scaled_font_size_y = font_size_pixels * scaling_factor_y
                                            empirical_factor = 0.75  
                                            effective_font_size = (scaled_font_size_x + scaled_font_size_y) / 2 * empirical_factor
                                            font_sized = f'{scaled_font_size_x:.2f}'
                                            
                                            line_height_font = engine_data['StyleRun'].get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('Leading', None)
                                            # log_to_stderr(engine_data['StyleRun'].get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {}))
                                            # log_to_stderr(f"checking of this : {line_height_font}")
                                            if float(font_size_points) * 1.2 < line_height_font: 
                                                line_height_points = font_size_points * 1.2
                                            else:
                                                line_height_points = line_height_font

                                            line_height_pixels = line_height_points * (dpi / 72)
                                            scaled_line_height_x_line = line_height_pixels * scaling_factor_x
                                            scaled_line_height_y_line = line_height_pixels * scaling_factor_y
                                            effective_line_height = (scaled_line_height_x_line + scaled_line_height_y_line) / 2 * empirical_factor

                                            line_height_get = f'{scaled_line_height_x_line:.2f}' 
                                            line_height_convert = float(line_height_get) / float(font_sized)
                                            line_height_em = round(line_height_convert, 2)

                                            # LineHeightstyle_data = engine_data['StyleRun'].get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {})
                                            # line_height = LineHeightstyle_data.get('Leading', None)
                                            # # log_to_stderr(f"line height data {LineHeightstyle_data}")
                                            # try:
                                            #     line_height = float(line_height) if line_height and isinstance(line_height, (int, float, str)) and str(line_height).replace('.', '', 1).isdigit() else None
                                            # except (ValueError, TypeError):
                                            #     line_height = None

                                            # if not line_height or line_height == 0:
                                            #     line_height = float(font_sized) * (1.0 if float(font_sized) < 20 else 1.2)

                                            # VScaling_factor_y = transform_matrix[3] if transform_matrix[3] != 0 else 1

                                            # max_scaling = 0.81 if float(font_sized) < 20 else 0.835
                                            # VScaling_factor_y = min(VScaling_factor_y, max_scaling)

                                            # line_height_pixels = line_height * (dpi / 72)
                                            # scaled_line_height = line_height_pixels * VScaling_factor_y
                                            # scaled_line_height = max(scaled_line_height, float(font_sized) * 1.0)
                                            # line_height_em = scaled_line_height / float(font_sized)

                                            # log_to_stderr(f"DEBUG: Font Size: {font_sized}, Raw Leading: {line_height}, "
                                            # f"Scaled X: {scaled_line_height_x}, Scaled Y: {scaled_line_height_y}, Line Height EM: {line_height_em:.3f}")
                                            # log_to_stderr(f"Layer: {pp.name}, Line Height: {effective_line_height:.5f} px, {line_height_em:.3f} em")
                                        
                                        if 'StyleRun' in engine_data:
                                            center = pp.engine_dict['StyleRun']
                                            font_caps = center.get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('FontCaps', None)
                                            style_run_alignment = center.get('RunArray', [{}])[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('StyleRunAlignment', None)                                   
                                            paracheck = pp.engine_dict['ParagraphRun']
                                            aligncheck = paracheck.get('RunArray', [{}])[0].get('ParagraphSheet', {}).get('Properties', {}).get('Justification', None)
                                            if aligncheck == 0:
                                                text_align = "left"
                                            elif aligncheck == 1:
                                                text_align = "center"
                                            elif aligncheck == 2:
                                                text_align = "center"
                                            else:
                                                text_align = "left"

                                            if font_caps == 2:
                                                text_content = text_content.upper()  # Convert all text to uppercase
                                            # if font_caps == 1:
                                            #     text_content = "".join([char.upper() if char.islower() else char for char in text_content])
                                            else:
                                                text_content


                                            centers = pp.engine_dict.get('StyleRun', {})
                                            run_array = centers.get('RunArray', [{}])
                                            fill_color = run_array[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('FillColor', {}).get('Values', None)
                                            stroke_color = run_array[0].get('StyleSheet', {}).get('StyleSheetData', {}).get('StrokeColor', {}).get('Values', None)
                                            if fill_color:
                                                rgb_fill = rgba_to_rgb(fill_color)

                                            if stroke_color:
                                                rgb_stroke = rgba_to_rgb(stroke_color)
                                            rgb_color = rgb_fill

                                            # fontset = pp.resource_dict['FontSet']

                                            fontset = pp.resource_dict['FontSet']
                                            fontsGet = str(fontset[0]['Name']).strip("'\"")
                                            
                                            family, font_weight_name, weight_value, type_font = extract_font_weight(fontsGet)

                                    except Exception as e:
                                        log_to_stderr(f"Error accessing engine dict data: {e}")
                                
                                else:
                                    log_to_stderr("Engine dict not available.")
                            
                        else:
                            log_to_stderr("This is not a text layer.")


                        # process_layer(pp, html_content, css_content)
                        sub_heading = f"sd_txta_Sub-Heading-{incre}"    
                        if "offer" in layer.name:
                            sequenceOrder_layer["offer"].append(f'<div class="offerwrap animate_fadeIn delay_0s"><div class="offerBox" id="sd_txta_Offer-text">')
                            sequenceOrder_layer["offer"].append(f'{text_content}')
                            sequenceOrder_layer["offer"].append('</div></div>')

                            css_content.append(f"""
                            .offerBox {{
                                width: {width}px;
                                height: {height}px;
                                position: absolute;
                                left: {x1 - xe2}px;
                                top: {y1 - ye2}px;
                                font-size: {font_sized}px;
                                font-family: '{family}', serif;
                                font-weight: {weight_value};
                                font-style: {type_font};
                                color: rgb{rgb_color};
                                line-height: {line_height_em}em;
                                text-align: {text_align};
                            }}
                                        """)


                        if "contactWrap" in layer.name:
                            shapeWrap =  ' id="sd_bgcolor_Contact-Background"'
                            log_to_stderr(f"newww: {pp.name}")
                            if "contactBackground" in pp.name:
                                contentBgx1, contentBgy1, contentBgx2, contentBgy2 = pp.bbox
                                contentBgWidth = contentBgx2 - contentBgx1
                                contentBgHeight = contentBgy2 - contentBgy1    
                                # html_content.append(f'<div class="outer contactWrap" id="sd_txta-BGGG">')
                                # html_content.append('</div>')
                                bgContact = get_better_color(layer)
                                css_content.append(f"""
                                    .contactWrap {{
                                            width: {contentBgWidth}px;
                                            height: {contentBgHeight}px;
                                            position: absolute;
                                            left: {contentBgx1}px;
                                            top: {contentBgy1}px;
                                            background: rgb{bgContact};
                                        }}
                                    """)
                            if "contactArea" in pp.name:
                                cx1, cy1, cx2, cy2 = pp.bbox
                                AreaConWidth = cx2 - cx1 -2
                                AreaConHeight = cy2 - cy1 -2

                            if "contactArea" not in getattr(pp, "name", "") and "contactBackground" not in getattr(pp, "name", ""):
                                if pp.kind == 'type':
                                    contactWidth, contactHeight, tx1, ty1 = get_text_layer_dimensions(pp)
                                if checkHtmlContactWrap == 1:
                                    classForContact = "tel"
                                    idContact = "Tel"
                                    sequenceOrder_layer.append(f'<div class="contactWrap"{shapeWrap}>')
                                else:
                                    classForContact = "email"
                                    idContact = "Email"

                                sequenceOrder_layer.append(f'<div class="{classForContact}" id="sd_txta-{idContact}">')
                                sequenceOrder_layer.append(f'{text_content}')
                                sequenceOrder_layer.append('</div>')
                                if checkHtmlContactWrap == 2:  
                                    sequenceOrder_layer.append('</div>')  
                                checkHtmlContactWrap += 1 
                                
                                if checkAppendContactWrap == 1:    
                                    css_content.append(f"""
                                        .tel {{
                                            width: {AreaConWidth}px;
                                            height: {contactHeight}px;
                                            font-size: {font_sized}px;
                                            font-family: '{family}', serif;
                                            font-weight: {weight_value};
                                            font-style: {type_font};
                                            color: rgb{rgb_color};
                                            line-height: {line_height_em}em;
                                            text-align: {text_align};
                                            position: absolute;
                                            left: {tx1 - xe2}px;
                                            top: {ty1 - xe2}px;
                                        }}

                                            """)
                                if checkAppendContactWrap == 2:            
                                    css_content.append(f"""
                                        .email {{
                                            width: {AreaConWidth}px;
                                            height: {contactHeight}px;
                                            font-size: {font_sized}px;
                                            font-family: '{family}', serif;
                                            font-weight: {weight_value};
                                            font-style: {type_font};
                                            color: rgb{rgb_color};
                                            line-height: {line_height_em}em;
                                            text-align: {text_align};
                                            position: absolute;
                                            left: {tx1 - xe2}px;
                                            top: {ty1 - xe2}px;
                                        }}

                                            """)        
                                checkAppendContactWrap += 1
                                # if checkHtmlContactWrap > 1:
                            
                        
                        if "mainHeading" in layer.name:
                            sequenceOrder_layer["mainHeading"].append(f'<div class="textWrap animate_fadeOut delay_3s"><div class="mainHeading animate_fadeIn delay_0s" id="sd_txta_Heading">')
                            sequenceOrder_layer["mainHeading"].append(f'{text_content}')
                            sequenceOrder_layer["mainHeading"].append('</div></div>')
                            css_content.append(f"""
                                .mainHeading {{
                                    width: {width}px;
                                    height: {height}px;
                                    position: absolute;
                                    left: {x1 - xe2}px;
                                    top: {y1 - ye2}px;
                                    font-family: '{family}', serif;
                                    font-weight: {weight_value};
                                    font-style: {type_font};
                                    font-size: {font_sized}px;
                                    color: rgb{rgb_color};
                                    line-height: {line_height_em}em;
                                    text-align: {text_align};
                                }}
                                        """)
                        

                        if "subHeading" in layer.name:
                            num_child_subHeading = len(layer)
                            if num_child_subHeading > cSubheading:
                                subHeadingAnimation = f" animate_fadeOut delay_{animateCrOut}s"
                            else:
                                subHeadingAnimation = ''
                            sequenceOrder_layer["subHeading"].append(f'<div class="textWrap{subHeadingAnimation}"><div class="subHeading{incre} animate_fadeIn delay_{animateCr}s" id="{sub_heading}">')
                            sequenceOrder_layer["subHeading"].append(f'{text_content}')
                            sequenceOrder_layer["subHeading"].append('</div></div>')
                            if cSubheading == 1:
                                css_content.append(f"""
                                .subHeading1,.subHeading2,.subHeading3 {{
                                    width: {width}px;
                                    height: {height}px;
                                    position: absolute;
                                    left: {x1 - xe2}px;
                                    top: {y1 - ye2}px;
                                    font-family: '{family}', serif;
                                    font-weight: {weight_value};
                                    font-style: {type_font};
                                    font-size: {font_sized}px;
                                    color: rgb{rgb_color};
                                    line-height: {line_height_em}em;
                                    text-align: {text_align};
                                }}
                                        """)
                            incre += 1; cSubheading += 1
                            animateCr += 4; animateCrOut += 4

                        if "hero" in layer.name and "hero 2" not in layer.name:
                            log_to_stderr(f"Processing hero layer: {layer.name}")
                            cssImage = None
                            check = None
                            clip_paths = []
                            for idx, child_layer in enumerate(reversed(layer)):
                                if "imageWrap" in child_layer.name:
                                    border_radius = "initial"
                                    clip_path = None
                                    wrapp_image = None
                                    if child_layer.kind == 'shape' and hasattr(child_layer, 'vector_mask'):
                                        if child_layer.origination:
                                            for shape in child_layer.origination:
                                                if 'RoundedRectangle' in str(shape):
                                                    border_radius = broder_radius_get(shape, child_layer)
                                                else:
                                                    try:                                                        
                                                        wrapp_image = child_layer.topil()
                                                        if wrapp_image is None:
                                                            raise ValueError("topil() returned None")
                                                        elif not isinstance(wrapp_image, Image.Image):
                                                            raise TypeError(f"topil() returned invalid type: {type(wrapp_image)}")
                                                    except Exception as e:
                                                        log_to_stderr(f"topil() failed: {e}")
                                                        clip_path = "inherit"

                                                    if wrapp_image:
                                                        image_path = f"output/{file_name_t}/images/{child_layer.name}.png"
                                                        os.makedirs(os.path.dirname(image_path), exist_ok=True)
                                                        try:
                                                            wrapp_image.save(image_path, "PNG")
                                                            file_size = os.path.getsize(image_path)
                                                            log_to_stderr(f"Saved image to {image_path} (Size: {file_size} bytes)")
                                                        except Exception as e:
                                                            log_to_stderr(f"Failed to save image to {image_path}: {e}")
                                                            clip_path = "inherit"
                                                            image_path = None

                                                        if image_path:
                                                            clip_path = image_clip_path_generate(image_path, child_layer)
                                                            if clip_path is None:
                                                                clip_path = "inherit"
                                        
                                if "imageWrap1" in child_layer.name or "imageWrap" in child_layer.name or "imageBorder" in child_layer.name:
                                    log_to_stderr(f"skipping shape: {child_layer.name}")
                                    check = child_layer.name
                                    if "imageBorder" not in check:
                                        x1, y1, x2, y2 = child_layer.bbox
                                        width = x2 - x1
                                        height = y2 - y1
                                    continue
                                if pp.kind not in ['pixel', 'smartobject']:
                                    log_to_stderr(f"no pixel")
                                    continue
                                if pp.is_visible():
                                    imgx1, imgy1, imgx2, imgy2 = child_layer.bbox
                                    if imgx1 < 0 or imgy1 < 0:
                                        crop_x1 = max(0, x1 - imgx1)
                                        crop_y1 = max(0, y1 - imgy1)
                                    else:
                                        crop_x1 = x1 - imgx1
                                        crop_y1 = y1 - imgy1

                                    crop_x2 = min(imgx2 - imgx1, x2 - imgx1)
                                    crop_y2 = min(imgy2 - imgy1, y2 - imgy1)

                                    file_update_name = re.sub(r'\s+', '-', child_layer.name.strip())
                                    image_path = f"output/{file_name_t}/images/{file_update_name}.jpg"
                                    
                                    try:
                                        layer_image = child_layer.topil()
                                        cropped_image = layer_image.crop((crop_x1, crop_y1, crop_x2, crop_y2))
                                        if cropped_image.mode in ('RGBA', 'P'):
                                            cropped_image = cropped_image.convert("RGB")
                                        cropped_image.save(image_path, "JPEG", quality=98, optimize=True)

                                    except Exception as e:
                                        log_to_stderr(f"Failed to save image for {child_layer.name}: {e}")

                            if countersOne == 1 or countersOne == 2 or countersOne == 3:
                                HeroAnimation = f" animate_fadeIn delay_{HeroAnimateOne}s"
                            else:
                                HeroAnimation = ''         

                        
                            if "hero 2" in layer.name:
                                cssImage = 1
                            else:    
                                cssImage = ''

                            if "imageWrap1" not in pp.name and "imageWrap" not in pp.name and "imageBorder" not in pp.name:  
                                final_path_image = re.sub(r'\s+', '-', pp.name)
                                outerSection["mainImages"].append(f'<div class="mainImage{countersOne} imageBox{cssImage}{HeroAnimation}">')
                                outerSection["mainImages"].append(f'<img src="images/{final_path_image}.jpg" alt="{sanitized_name}" id="{imageLayer}-{countersOne}" />')
                                outerSection["mainImages"].append('</div>')
                                countersOne += 1  
                                idxImageOne += 1    
                            if countersOne == 2:
                                # if x1 < 0 or y1 < 0:
                                #     xImg = +1
                                #     yImg = +1
                                # else:    
                                #     xImg = -1
                                #     yImg = -1

                                css_content.append(f"""
                                    .imageBox{cssImage} {{
                                        width: {width-3}px;
                                        height: {height-3}px;
                                        position: absolute;
                                        left: {x1}px;
                                        top: {y1}px;
                                        z-index: 1;
                                        overflow: hidden;
                                        border-radius: {border_radius};
                                        clip-path: {clip_path};
                                        -webkit-clip-path: {clip_path}
                                    }}
                                    .imageBox{cssImage} img {{
                                        width: {width-3}px;
                                        height: {height-3}px;
                                        object-fit: cover;
                                    }}
                                """)
                            HeroAnimateOne += 4    
                            log_to_stderr(f"Processed image: {sanitized_name}")

                    
                        if "hero 2" in layer.name:
                            log_to_stderr(f"Processing hero layer: {layer.name}")
                            cssImage = None
                            check = None
                            for idx, child_layer in enumerate(reversed(layer), start=1):

                                if "imageWrap" in child_layer.name:
                                    border_radius = "initial"
                                    clip_path = None

                                    wrapp_image = None
                                    if child_layer.kind == 'shape' and hasattr(child_layer, 'vector_mask'):
                                        if child_layer.origination:
                                            for shape in child_layer.origination:
                                                if 'RoundedRectangle' in str(shape):
                                                    border_radius = broder_radius_get(shape, child_layer)
                                                else:
                                                    try:                                                        
                                                        wrapp_image = child_layer.topil()
                                                        if wrapp_image is None:
                                                            raise ValueError("topil() returned None")
                                                        elif not isinstance(wrapp_image, Image.Image):
                                                            raise TypeError(f"topil() returned invalid type: {type(wrapp_image)}")
                                                    except Exception as e:
                                                        log_to_stderr(f"topil() failed: {e}")
                                                        clip_path = "inherit"

                                                    if wrapp_image:
                                                        image_path = f"output/{file_name_t}/images/{child_layer.name}.png"
                                                        os.makedirs(os.path.dirname(image_path), exist_ok=True)
                                                        try:
                                                            wrapp_image.save(image_path, "PNG")
                                                            file_size = os.path.getsize(image_path)
                                                            log_to_stderr(f"Saved image to {image_path} (Size: {file_size} bytes)")
                                                        except Exception as e:
                                                            log_to_stderr(f"Failed to save image to {image_path}: {e}")
                                                            clip_path = "inherit"
                                                            image_path = None

                                                        if image_path:
                                                            clip_path = image_clip_path_generate(image_path, child_layer)
                                                            if clip_path is None:
                                                                clip_path = "inherit"



                                if "imageWrap1" in child_layer.name or "imageWrap" in child_layer.name or "imageBorder" in child_layer.name:
                                    log_to_stderr(f"skipping shape: {child_layer.name}")
                                    check = child_layer.name
                                    if "imageBorder" not in check:
                                        x1, y1, x2, y2 = child_layer.bbox
                                        width = x2 - x1
                                        height = y2 - y1
                                    continue
                                if pp.kind not in ['pixel', 'smartobject']:
                                    log_to_stderr(f"no pixel")
                                    continue
                                if pp.is_visible():
                                    imgx1, imgy1, imgx2, imgy2 = child_layer.bbox
                                    if imgx1 < 0 or imgy1 < 0:
                                        crop_x1 = max(0, x1 - imgx1)
                                        crop_y1 = max(0, y1 - imgy1)
                                    else:
                                        crop_x1 = x1 - imgx1
                                        crop_y1 = y1 - imgy1

                                    crop_x2 = min(imgx2 - imgx1, x2 - imgx1)
                                    crop_y2 = min(imgy2 - imgy1, y2 - imgy1)

                                    file_update_name = re.sub(r'\s+', '-', child_layer.name.strip())
                                    image_path = f"output/{file_name_t}/images/{file_update_name}{idxImageTwo}.jpg"

                                    try:
                                        layer_image = child_layer.topil()
                                        cropped_image = layer_image.crop((crop_x1, crop_y1, crop_x2, crop_y2))
                                        if cropped_image.mode in ('RGBA', 'P'):
                                            cropped_image = cropped_image.convert("RGB")
                                        cropped_image.save(image_path, "JPEG", quality=98, optimize=True)
                                    except Exception as e:
                                        log_to_stderr(f"Failed to save image for {child_layer.name}: {e}")
    
                            if countersTwo == 1 or countersTwo == 2 or countersTwo == 3:
                                HeroAnimationTwo = f" animate_fadeIn delay_{HeroAnimateTwo}_5s"
                            else:
                                HeroAnimationTwo = ''         

                            # if "hero" in layer.name and "hero2" in layer.name:     
                            #     cssImage = 1
                            # else:
                            #     cssImage = ''
                            #     cssImage = cssImage.strip()

                            if "hero 2" in layer.name and "hero" not in layer.name:
                                cssImage = 1
                            if "hero" in layer.name and "hero 2" in layer.name:
                                cssImage = ''

                            if "imageWrap1" not in pp.name and "imageWrap" not in pp.name and "imageBorder" not in pp.name:  
                                final_path_image = re.sub(r'\s+', '-', pp.name)
                                outerSection["mainImages"].append(f'<div class="mainImage{counter_hero2} imageBox2 {HeroAnimationTwo}">')
                                outerSection["mainImages"].append(f'<img src="images/{final_path_image}{idxImageTwo}.jpg" alt="{sanitized_name}" id="{imageLayer}-{countersTwo}" />')
                                outerSection["mainImages"].append('</div>')
                                counter_hero2 += 1
                                countersTwo += 1      
                            if countersTwo == 2:
                                css_content.append(f"""
                                    .imageBox2 {{
                                        width: {width-3}px;
                                        height: {height-3}px;
                                        position: absolute;
                                        left: {x1}px;
                                        top: {y1}px;
                                        z-index: 1;
                                        overflow: hidden;
                                        border-radius: {border_radius};
                                        clip-path: {clip_path};
                                        -webkit-clip-path: {clip_path}
                                    }}
                                    .imageBox2 img {{
                                        width: {width-3}px;
                                        height: {height-3}px;
                                        object-fit: cover;
                                    }}
                                """)
                            HeroAnimateTwo += 4    
                            log_to_stderr(f"Processed image: {sanitized_name}")

                                    
                        if "cta" in pp.name:

                            # if pp.has_vector_mask():

                                # def get_border_radius(layer, rendered_width=None, rendered_height=None):
                                #     if not pp.has_vector_mask():
                                #         log_to_stderr("No vector mask found")
                                #         return None
                                    
                                #     vector_mask = pp.vector_mask
                                    
                                #     width = rendered_width if rendered_width is not None else pp.width
                                #     height = rendered_height if rendered_height is not None else pp.height
                                #     # log_to_stderr(f"Using width: {width}px, height: {height}px") log_to_stderr(f"Number of paths: {len(vector_mask.paths)}")
                                    
                                #     radii_px = []
                                    
                                #     for path in vector_mask.paths:
                                #         # log_to_stderr(f"Processing path: {path}")log_to_stderr(f"Type of path: {type(path)}")log_to_stderr(f"Number of knots: {len(path)}")
                                        
                                #         for i in range(len(path)):
                                #             knot1 = path[i]
                                #             knot2 = path[(i + 1) % len(path)] 
                                #             anchor1 = knot1.anchor
                                #             anchor2 = knot2.anchor
                                #             leaving1 = knot1.leaving
                                #             preceding2 = knot2.preceding
                                            
                                #             if leaving1 != anchor1 or preceding2 != anchor2:
                                #                 log_to_stderr(f"Found curved segment between {anchor1} and {anchor2}")
                                #                 dx = anchor2[0] - anchor1[0]
                                #                 dy = anchor2[1] - anchor1[1]

                                #                 d_px = math.sqrt((dx * width)**2 + (dy * height)**2)
                                #                 r_px = d_px / math.sqrt(2) 
                                #                 radii_px.append(r_px)
                                #             else:
                                #                 log_to_stderr(f"Straight segment between {anchor1} and {anchor2}")
                                    
                                #     if radii_px:
                                #         avg_radius = sum(radii_px) / len(radii_px)
                                #         return avg_radius
                                #     else:
                                #         log_to_stderr("No curved segments found")
                                #         return None

                                # rendered_width = psd.width
                                # rendered_height = psd.height 
                                # border_radius = get_border_radius(pp, rendered_width=rendered_width, rendered_height=rendered_height)
                                # if border_radius is not None:
                                #     log_to_stderr(f"Border Radius: {border_radius:.2f}px")
                                #     radiusGet = f'{border_radius:.2f}'
                                #     # base_font_size = 16
                                #     # rad_em = float(radiusGet) / base_font_size
                                #     radius_e = radiusGet

                                # vector_maskf = pp.vector_mask
                                # for subpath in vector_maskf.paths:
                                #     anchors = [
                                #         (
                                #             int(knot.anchor[0] * width),   # Scale X coordinate
                                #             int(knot.anchor[1] * height)  # Scale Y coordinate
                                #         )
                                #         for knot in subpath
                                #     ]
                                #     log_to_stderr(f"Anchors for subpath: {anchors}")

                                # Getting path data and radius
                                # WIDTH_PX = width
                                # HEIGHT_PX = height
                                # vector_mask = pp._vector_mask
                                # vector_data = vector_mask._data

                                # if hasattr(vector_data, 'path'):
                                #     path_items = vector_data.path._items
                                #     if len(path_items) > 2:
                                #         path_points = path_items[2]

                                #         # Calculate radius as the actual distance between control points
                                #         for i in range(len(path_points) - 1):
                                #             anchor1 = getattr(path_points[i], 'anchor', None)
                                #             anchor2 = getattr(path_points[i + 1], 'anchor', None)
                                #             if anchor1 and anchor2:
                                #                 # Distance between two anchor points — better for curves
                                #                 x_diff = abs(anchor2[0] - anchor1[0])
                                #                 y_diff = abs(anchor2[1] - anchor1[1])
                                #                 radius_normalized = ((x_diff ** 2 + y_diff ** 2) ** 0.5) / 2

                                #                 # Convert to pixels
                                #                 border_radius_px = radius_normalized * min(WIDTH_PX, HEIGHT_PX)

                                #                 # Apply scale
                                #                 scale_factor = 2
                                #                 border_radius_px_corrected = border_radius_px * scale_factor
                                #                 log_to_stderr(f"Corrected Border Radius: {border_radius_px_corrected:.2f}px")
                                #                 break



                            if pp.origination:
                                for shapeBtn in pp.origination:
                                    if 'RoundedRectangle' in str(shapeBtn):
                                        radius_e = broder_radius_get(shapeBtn, pp)
                                        radius_e = float(radius_e.replace('px', '').split()[0])
                                        radius_e = radius_e / 16
                                    else:
                                        radius_e = 0    
                            else:
                                radius_e = 0                


                            
                            if (width_psd, height_psd) in need_valid_sizes:
                                width_contain = width_psd - 1
                                max_width_add = float(width_contain * 0.8)
                            else: 
                                max_width_add = width + 2
                                width_contain =  None

                            sequenceOrder_layer["cta"].append(f'<div class="cta animate_fadeIn delay_5s">')
                            sequenceOrder_layer["cta"].append(f'<a class="button" id="sd_btn_Click-Through-URL" target="_blank" href="http://www.ekcs.co">{text_content}')
                            sequenceOrder_layer["cta"].append('</a>')
                            sequenceOrder_layer["cta"].append('</div>')
                            ctaColor = get_better_color(layer)
                            css_lines = [".cta {"]
                            if width_contain is not None:
                                css_lines.append(f"    width: {width_contain}px;")
                            else:
                                css_lines.append(f"    width: auto;")

                            css_lines.append("    display: flex;")
                            css_lines.append("    position: absolute;")
                            if width_contain is not None:
                                css_lines.append(f"    left: 0px;")
                            else:    
                                css_lines.append(f"    left: {x1 - xe2}px;")
                            css_lines.append(f"    top: {y1 - ye2}px;")
                            if width_contain is not None:
                                css_lines.append(f"    justify-content: center;")
                            else:    
                                css_lines.append("    text-align: center;")
                            css_lines.append("}")
                            css_lines.append(".button {")
                            css_lines.append(f"    min-width: {width}px;")
                            css_lines.append(f"    max-width: {max_width_add:.2f}px;")
                            css_lines.append(f"    max-height: {height - 2}px;")
                            css_lines.append(f"    font-size: {font_sized}px;")
                            css_lines.append(f"    font-family: '{family}', serif;")
                            css_lines.append(f"    font-weight: {weight_value};")
                            css_lines.append(f"    font-style: {type_font};")
                            css_lines.append("    cursor: pointer;")
                            css_lines.append(f"    color: rgb{rgb_color};")
                            css_lines.append("    display: inline-flex;")
                            css_lines.append("    align-items: center;")
                            css_lines.append("    justify-content: center;")
                            css_lines.append(f"    background-color: rgb{ctaColor};")
                            css_lines.append("    padding: 0.5em 0.65em 0.51em;")
                            css_lines.append("    text-align: center;")
                            css_lines.append(f"    line-height: {line_height_em}em;")
                            css_lines.append(f"    border-radius: {radius_e:.2f}em;")
                            css_lines.append("}")

                            css_content.append("\n".join(css_lines))
                        
                        # if "contactWrap" in layer.name:
                        #     if "contactArea" in pp.name or 'contactBackground' in pp:
                        #         continue
                        #     content_html_app.append(f'<div class="contactWrap animate_fadeIn delay_0s"><div class="contactText" id="sd_txta-text">')
                        #     content_html_app.append(f'{text_content}')
                        #     content_html_app.append('</div></div>')
                        #     log_to_stderr(f"gettting {pp}")
                        #     if pp.kind == 'type':
                        #         wws, hhs = get_text_layer_dimensions(pp)
                        #         log_to_stderr(f"sTexts: {pp} Width: {wws}px, Height: {hhs}px")
                        #     css_content.append(f"""
                        #     .contactWrap {{
                        #         width: {width}px;
                        #         height: {height}px;
                        #         position: absolute;
                        #         left: {x1 - xe2}px;
                        #         top: {y1 - ye2}px;
                        #         font-family: {fontf}', serif;
                        #         font-weight: {fontGetWeight};
                        #         font-size: {font_sized}px;
                        #         color: rgb{rgb_color};
                        #         line-height: {line_height_em}em;
                        #         text-align: {text_align};
                        #     }}

                        #                 """)

                        # if hasattr(pp, 'layers') and pp.layers:
                        #     process_layer(pp, html_content, css_content)
                    # for child_layer in layer:
                    #     process_layer(child_layer, html_content, css_content)
                        
                    #     if hasattr(child_layer, 'text') and child_layer.text:
                    #         text_content = child_layer.text
                    #         log_to_stderr(f"Text content found: {text_content}")
                else:
                    log_to_stderr(f"Skipping unsupported layer: {layer.name}")


            for layer in psd:
                if hasattr(layer, "locks") and getattr(layer.locks, "transparency", False):
                    continue
                if layer.name == "bg":
                    color = get_layer_color(layer)
                    if color:
                        log_to_stderr(f"backgroundColor has color: {color}")
                    else:
                        log_to_stderr("backgroundColor has no color.") 


                html_content = ['<!DOCTYPE html>',
                                '<html lang="en">',
                                '<head>',
                                '<meta charset="UTF-8" />',
                                '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
                                f'<meta name="ad.size" content="width={width_meta},height={height_meta}" />',
                                '<meta http-equiv="X-UA-Compatible" content="ie=edge" />',
                                f'<title>{file_name_t}</title>',
                                '<link rel="preconnect" href="https://fonts.googleapis.com" />',
                                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
                                f'<link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap" rel="stylesheet">',
                                '<link rel="stylesheet" href="https://digital.mediaferry.com/animation.css">',
                                '<link rel="stylesheet" href="./css/style.css" />',
                                '</head>',
                                '<body>',
                                '<div class="container" id="sd_bgcolor_Main-Background">',
                                '<a href="javascript:window.open(window.trackingUrl + window.clickTag)"></a>',
                                '<a class="clicktru" target="_blank" href="#"></a>',
                                # '<div class="contentSection">'
                        ]
                content_html_app = []
                css_content = [
                    '''* {
                        margin: 0px;
                        padding: 0px;
                        box-sizing: border-box;
                    }''',
                    '''
                    :root {
                        --width: %(width_meta)spx;
                        --height: %(height_meta)spx;
                    }
                    '''% {"width_meta": width_meta, "height_meta": height_meta},
                    '''
                    .container {
                        width: %(width_meta)spx;
                        height: %(height_meta)spx;
                        position: relative;
                        overflow: hidden;
                        border: 1px solid #7a8599;
                        background-color: rgb%(color)s;
                    }
                    '''% {"width_meta": width_meta, "height_meta": height_meta, "color": color},
                    '''   .clicktru {
                        z-index:9999; width:100%; height:100%; position:absolute;
                    }''',
                    '''
                        a{
                            text-decoration:none;
                    } ''',
                    '''
                        #sd_btn_Click-Through-URL:empty{display:none;} 
                    '''
                    ]

            for layer in psd:
                process_layer(layer, html_content, css_content, content_html_app)

            html_content.extend(outerSection.get("shapes", []))
            html_content.extend(outerSection.get("logo", []))
            content_html_app.extend(sequenceOrder_layer.get("mainHeading", []))
            content_html_app.extend(sequenceOrder_layer.get("subHeading", []))
            content_html_app.extend(sequenceOrder_layer.get("offer", []))
            content_html_app.extend(sequenceOrder_layer.get("contactWrap", []))
            content_html_app.extend(sequenceOrder_layer.get("cta", []))

            html_content.append('<div class="contentSection">')
            html_content.extend(content_html_app)
            html_content.append('</div>')

            html_content.extend(outerSection.get("mainImages", []))

            for keyClearOuter in outerSection:
                outerSection[keyClearOuter].clear()
            for keyClear in sequenceOrder_layer:
                sequenceOrder_layer[keyClear].clear()

            html_content.append('''
                </div>
                <script>
                    function getQueryStringValue(key) {
                        return decodeURIComponent(window.location.search.replace(new RegExp("^(?:.*[&\\?]" + escape(key).replace(/[\\.\\+\\*]/g, "\\\\$&") + "(?:\\=([^&]*))?)?.*$", "i"), "$1"));
                    }

                    var clickTag = document.getElementById("sd_btn_Click-Through-URL").getAttribute("href");
                    var trackingUrl = getQueryStringValue("trackurl");
                    var resURL = trackingUrl + clickTag;

                    var elements = document.getElementsByClassName("clicktru");

                    for (var i = 0; i < elements.length; i++) {
                        elements[i].setAttribute("href", resURL);
                    }
                </script>
            </body>
            </html>
            ''')


            with open(f'{output_dir}/index.html', 'w') as f:
                f.write("\n".join(html_content))

            with open(f'{output_dir}/css/style.css', 'w') as f:
                f.write("\n".join(css_content))

            log_to_stderr("HTML and CSS files generated.")
            html = "\n".join(html_content)
            css = "\n".join(css_content)

            # Store results without overwriting
            results[psd_file] = {
                "success": True,
                "html": html,
                "css": css
            }
            log_to_stderr(f"Processed PSD: {psd_file} with HTML, CSS, and images")

    return {"success": True, "results": results}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        log_to_stderr("Usage: python convert_psd.py <zip_file_path>")
        print(json.dumps({"success": False, "error": "Usage: python convert_psd.py <zip_file_path>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = convert_psd_to_html(file_path)
    print(json.dumps(result))  # Ensure only JSON is printed to stdout