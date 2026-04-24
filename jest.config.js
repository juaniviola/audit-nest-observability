const path = require('path');

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [require.resolve('ts-jest', { paths: [path.resolve(__dirname, '../../backend/node_modules')] }), { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@lib/(.*)$': '<rootDir>/src/$1',
  },
};
