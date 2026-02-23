const mongoose = require('mongoose');

const PostedPropertySchema = new mongoose.Schema({
    propertyId: { type: String, required: true, unique: true },
    postId: { type: String },        // Facebook Post ID
    pageId: { type: String },        // Facebook Page ID
    pageName: { type: String },      // Tên Fanpage
    caption: { type: String },       // Nội dung bài đăng
    postedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PostedProperty', PostedPropertySchema);
