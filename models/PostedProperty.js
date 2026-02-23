const mongoose = require('mongoose');

const PostedPropertySchema = new mongoose.Schema({
    propertyId: { type: String, required: true, unique: true },
    postedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PostedProperty', PostedPropertySchema);
