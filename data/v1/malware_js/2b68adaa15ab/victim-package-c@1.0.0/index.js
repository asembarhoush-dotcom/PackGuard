/**
 * victim-package-c
 * A testing package for CI/CD automation
 */

function greet(name) {
  return `Hello, ${name}! This is victim-package-c.`;
}

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = {
  greet,
  add,
  multiply
};
