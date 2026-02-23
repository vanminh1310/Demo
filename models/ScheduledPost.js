const mongoose = require('mongoose');

const ScheduledPostSchema = new mongoose.Schema({
    propertyId: { type: String, required: true },
    property: { type: Object, required: true },
    caption: { type: String, required: true },
    pageId: { type: String, required: true },
    pageName: { type: String },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'posted', 'failed'], default: 'pending' },
    error: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScheduledPost', ScheduledPostSchema);
