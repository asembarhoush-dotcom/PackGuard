/**
 * Pads a string to a specified length using funny words
 * @param {string} str - The input string to pad
 * @param {number} length - The target length of the padded string
 * @param {Object} options - Optional configuration
 * @param {string} options.funnyWord - The funny word to use for padding (default: random funny word)
 * @param {boolean} options.padLeft - If true, pad on the left side; otherwise pad on the right (default: false)
 * @returns {string} The padded string
 */
function funnyPad(str, length, options = {}) {
  // Input validation
  if (typeof str !== 'string') {
    throw new Error('Input must be a string');
  }

  if (typeof length !== 'number') {
    throw new Error('Length must be a number');
  }

  if (length < 0) {
    throw new Error('Length must be a positive number');
  }

  // Security: Prevent excessive memory allocation
  const MAX_LENGTH = 10000;
  if (length > MAX_LENGTH) {
    throw new Error(`Length exceeds maximum allowed (${MAX_LENGTH})`);
  }

  // Default funny words
  const defaultFunnyWords = [
    'banana',
    'pickle',
    'noodle',
    'waffles',
    'doodle',
    'giggle',
    'bubble',
    'muffin',
    'wiggle',
    'snooze'
  ];

  // Get funny word from options or use random default
  let funnyWord = options.funnyWord;

  if (funnyWord === undefined) {
    funnyWord = defaultFunnyWords[Math.floor(Math.random() * defaultFunnyWords.length)];
  }

  // Validate funny word
  if (typeof funnyWord !== 'string') {
    throw new Error('Funny word must be a string');
  }

  if (funnyWord.length === 0) {
    throw new Error('Funny word cannot be empty');
  }

  // If string is already at or exceeds target length, return as-is
  if (str.length >= length) {
    return str;
  }

  // Calculate padding needed
  const paddingNeeded = length - str.length;

  // Create padding by repeating the funny word
  let padding = '';
  while (padding.length < paddingNeeded) {
    padding += funnyWord;
  }

  // Trim padding to exact length needed
  padding = padding.slice(0, paddingNeeded);

  // Apply padding based on direction
  if (options.padLeft) {
    return padding + str;
  } else {
    return str + padding;
  }
}

module.exports = funnyPad;
