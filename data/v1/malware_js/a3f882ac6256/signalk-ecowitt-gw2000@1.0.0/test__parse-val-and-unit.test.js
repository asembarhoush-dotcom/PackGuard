const { utils } = require('../index.js');
const { parseValAndUnit } = utils;

describe('parseValAndUnit', () => {
  describe('when unit is a separate field', () => {
    test('parses numeric value and unit field', () => {
      const result = parseValAndUnit({ val: '16.4', unit: 'C' });
      expect(result.val).toBe(16.4);
      expect(result.unit).toBe('C');
    });

    test('trims unit whitespace', () => {
      const result = parseValAndUnit({ val: '16.4', unit: '  C  ' });
      expect(result.unit).toBe('C');
    });

    test('converts unit field to string', () => {
      const result = parseValAndUnit({ val: '16.4', unit: 123 });
      expect(result.unit).toBe('123');
    });
  });

  describe('when unit is embedded in value string', () => {
    test('parses "6.22 knots" format', () => {
      const result = parseValAndUnit({ val: '6.22 knots' });
      expect(result.val).toBe(6.22);
      expect(result.unit).toBe('knots');
    });

    test('parses "15 degrees" format', () => {
      const result = parseValAndUnit({ val: '15 degrees' });
      expect(result.val).toBe(15);
      expect(result.unit).toBe('degrees');
    });

    test('parses "35.91 W/m2" format', () => {
      const result = parseValAndUnit({ val: '35.91 W/m2' });
      expect(result.val).toBe(35.91);
      expect(result.unit).toBe('W/m2');
    });

    test('parses value with no unit', () => {
      const result = parseValAndUnit({ val: '42' });
      expect(result.val).toBe(42);
      expect(result.unit).toBe('');
    });
  });

  describe('edge cases', () => {
    test('handles negative values', () => {
      const result = parseValAndUnit({ val: '-5.5 C' });
      expect(result.val).toBe(-5.5);
      expect(result.unit).toBe('C');
    });

    test('handles zero', () => {
      const result = parseValAndUnit({ val: '0 mm' });
      expect(result.val).toBe(0);
      expect(result.unit).toBe('mm');
    });

    test('parses scientific notation (regex limitation: treats e-3 as part of unit)', () => {
      // The regex ^(-?[\d.]+)\s*(.*)$ matches only digits/dots at the start
      // So '1.5e-3 A' → val: 1.5, unit: 'e-3 A' (because parseFloat('1.5e-3 A') = 1.5)
      const result = parseValAndUnit({ val: '1.5e-3 A' });
      expect(result.val).toBe(1.5); // parseFloat stops at 'e' when parsing '1.5e-3'
      expect(result.unit).toBe('e-3 A'); // regex extracts what follows the number
    });

    test('handles leading whitespace in value string', () => {
      const result = parseValAndUnit({ val: '  10 knots' });
      expect(result.val).toBe(10);
      expect(result.unit).toBe('knots');
    });

    test('handles multiple spaces between value and unit', () => {
      const result = parseValAndUnit({ val: '10   knots' });
      expect(result.val).toBe(10);
      expect(result.unit).toBe('knots');
    });

    test('handles percent sign in value', () => {
      const result = parseValAndUnit({ val: '50%' });
      expect(result.val).toBe(50);
      expect(result.unit).toBe('%');
    });

    test('returns NaN for non-numeric values (regex requires digit at start)', () => {
      // Regex ^(-?[\d.]+)\s*(.*)$ requires a digit at start
      // 'abc' doesn't match, so parseFloat('abc') → NaN, unit → ''
      const result = parseValAndUnit({ val: 'abc' });
      expect(result.val).toBeNaN();
      expect(result.unit).toBe(''); // unit is empty when regex doesn't match
    });

    test('returns NaN for "--" (missing sensor, regex requires digit at start)', () => {
      // '--' doesn't start with a digit, regex doesn't match
      // parseFloat('--') → NaN, unit → ''
      const result = parseValAndUnit({ val: '--' });
      expect(result.val).toBeNaN();
      expect(result.unit).toBe(''); // unit is empty when regex doesn't match
    });

    test('prefers separate unit field over embedded unit', () => {
      const result = parseValAndUnit({ val: '10 knots', unit: 'mph' });
      expect(result.val).toBe(10);
      expect(result.unit).toBe('mph'); // unit field wins
    });
  });

  describe('malformed input', () => {
    test('handles empty val string', () => {
      const result = parseValAndUnit({ val: '' });
      expect(result.val).toBeNaN();
      expect(result.unit).toBe('');
    });

    test('handles undefined val (should coerce to parseFloat("undefined"))', () => {
      const result = parseValAndUnit({ val: undefined });
      expect(result.val).toBeNaN();
    });

    test('handles numeric val directly', () => {
      const result = parseValAndUnit({ val: 42 });
      expect(result.val).toBe(42);
      expect(result.unit).toBe('');
    });

    test('handles null val', () => {
      const result = parseValAndUnit({ val: null });
      expect(result.val).toBeNaN();
    });
  });
});
