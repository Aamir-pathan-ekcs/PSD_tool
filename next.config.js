/** @type {import('next').NextConfig} */
const nextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '900mb', // Adjust as needed
    },
  },
};
module.exports = {
  output: 'export',
};

module.exports = nextConfig;