require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
    try {
        console.log("⏳ Đang kết nối tới MongoDB Atlas...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Kết nối thành công!");

        const username = process.env.NV_USERNAME || 'admin';
        const password = process.env.NV_PASSWORD || 'admin1234@123';

        // Xóa tài khoản cũ bị dính lỗi (nếu có)
        await User.deleteMany({ username: username });
        console.log(`🗑️ Đã xóa sạch dữ liệu cũ của user: ${username}`);

        // Tạo tài khoản mới
        await User.create({ username, password });
        console.log(`🎉 TẠO TÀI KHOẢN THÀNH CÔNG!`);
        console.log(`👤 Tài khoản: ${username}`);
        console.log(`🔑 Mật khẩu: ${password}`);

        process.exit(0);
    } catch (error) {
        console.error("❌ XẢY RA LỖI:", error.message);
        process.exit(1);
    }
}

seedAdmin();
