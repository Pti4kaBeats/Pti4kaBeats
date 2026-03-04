// GitHub Stats Proxy Worker

const { createProxyMiddleware } = require('http-proxy-middleware');

const statsProxy = createProxyMiddleware('/api/stats', {
    target: 'https://github.com/', // Target GitHub URL
    changeOrigin: true,
    pathRewrite: {
        '^/api/stats': '', // Strip the API path
    },
});

module.exports = statsProxy;