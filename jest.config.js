const path = require('path');

// Load test env vars
require('dotenv').config({ path: path.join(__dirname, '.env.jest') });

module.exports = {
  verbose: true,
  testTimeout: 10000,
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/fragments/'],
};
