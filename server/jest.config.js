/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  clearMocks: true,
  // Prevent Jest from running the whole suite forever if a test
  // accidentally leaves an open DB connection or handle.
  forceExit: true,
};
