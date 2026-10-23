const assert = require('assert');
const { analyzeEmail } = require('../index');

describe('analyzeEmail', () => {
  it('should analyze an email', () => {
    const email = analyzeEmail('test@test.com');
    assert.ok(email.includes('test@test.com'));
  });

});