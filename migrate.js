require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const PostedProperty = require('./models/PostedProperty');

async function migrate() {
    console.log("⏳ Kết nối MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);

    if (fs.existsSync('posted.json')) {
        const posted = JSON.parse(fs.readFileSync('posted.json'));
        let count = 0;
        console.log(`Bắt đầu đồng bộ ${posted.length} bài đăng sang MongoDB...`);
        for (const id of posted) {
            try {
                await PostedProperty.create({ propertyId: id });
                count++;
            } catch (e) {
                // Ignore duplicates
            }
        }
        console.log(`✅ Đã đồng bộ thành công ${count} phòng cũ lên CSDL!`);
    } else {
        console.log("Không tìm thấy file posted.json để đồng bộ.");
    }
    process.exit(0);
}

migrate();
