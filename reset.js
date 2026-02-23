require('dotenv').config();
const mongoose = require('mongoose');
const PostedProperty = require('./models/PostedProperty');

async function reset() {
    console.log("⏳ Kết nối MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await PostedProperty.deleteMany({});
    console.log(`🗑️ Đã xóa ${result.deletedCount} bản ghi`);
    console.log("✅ Reset THÀNH CÔNG! Tất cả phòng đều trở về trạng thái Chờ Đăng.");
    process.exit(0);
}

reset();
