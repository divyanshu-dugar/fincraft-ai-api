require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 8080;

(async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`[boot] NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);
    });
})();

module.exports = app;