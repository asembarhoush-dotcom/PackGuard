const path = require('path');

module.exports = {
    // Chế độ build: 'development' hoặc 'production'
    mode: 'production',
    
    // Điểm vào của ứng dụng
    entry: './index.js',
    
    // Cấu hình đầu ra
    output: {
        filename: 'bundle.js', // Tên file đầu ra
        path: path.resolve(__dirname, 'dist'), // Thư mục đầu ra
    },
    
    // Mục tiêu chạy: 'node' để build cho môi trường Node.js
    target: 'node'
};
