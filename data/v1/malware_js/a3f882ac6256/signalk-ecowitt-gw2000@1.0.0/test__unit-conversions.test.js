const { utils } = require('../index.js');
const { tempToK, windToMs, pressureToPa, rainToM, rainRateToMs } = utils;

describe('Unit Conversions', () => {
  describe('tempToK', () => {
    test('converts Celsius to Kelvin', () => {
      expect(tempToK(0, '°C')).toBeCloseTo(273.15, 1);
      expect(tempToK(20, '°C')).toBeCloseTo(293.15, 1);
      expect(tempToK(100, '°C')).toBeCloseTo(373.15, 1);
    });

    test('converts Fahrenheit to Kelvin', () => {
      expect(tempToK(32, '°F')).toBeCloseTo(273.15, 1);
      expect(tempToK(68, '°F')).toBeCloseTo(293.15, 1);
      expect(tempToK(212, '°F')).toBeCloseTo(373.15, 1);
    });

    test('handles uppercase F unit', () => {
      expect(tempToK(68, 'F')).toBeCloseTo(293.15, 1);
    });

    test('defaults to Celsius when unit is missing', () => {
      expect(tempToK(20, '')).toBeCloseTo(293.15, 1);
      expect(tempToK(20, null)).toBeCloseTo(293.15, 1);
      expect(tempToK(20, undefined)).toBeCloseTo(293.15, 1);
    });

    test('handles negative temperatures', () => {
      expect(tempToK(-40, '°C')).toBeCloseTo(233.15, 1);
      expect(tempToK(-40, '°F')).toBeCloseTo(233.15, 1); // -40°C = -40°F
    });
  });

  describe('windToMs', () => {
    test('converts knots to m/s', () => {
      expect(windToMs(1, 'knots')).toBeCloseTo(0.514444, 4);
      expect(windToMs(10, 'knots')).toBeCloseTo(5.14444, 4);
    });

    test('handles kn abbreviation', () => {
      expect(windToMs(10, 'kn')).toBeCloseTo(5.14444, 4);
    });

    test('converts km/h to m/s', () => {
      expect(windToMs(3.6, 'km/h')).toBeCloseTo(1.0, 2);
      expect(windToMs(36, 'km/h')).toBeCloseTo(10.0, 1);
    });

    test('converts mph to m/s', () => {
      expect(windToMs(1, 'mph')).toBeCloseTo(0.44704, 4);
      expect(windToMs(10, 'mph')).toBeCloseTo(4.4704, 3);
    });

    test('defaults to m/s (no conversion)', () => {
      expect(windToMs(5, 'm/s')).toBe(5);
      expect(windToMs(5, '')).toBe(5);
      expect(windToMs(5, null)).toBe(5);
    });

    test('handles case-insensitive units', () => {
      expect(windToMs(10, 'KNOTS')).toBeCloseTo(5.14444, 4);
      expect(windToMs(10, 'Knots')).toBeCloseTo(5.14444, 4);
    });

    test('trims whitespace from units', () => {
      expect(windToMs(10, ' knots ')).toBeCloseTo(5.14444, 4);
    });
  });

  describe('pressureToPa', () => {
    test('converts hPa to Pa', () => {
      expect(pressureToPa(1013.25, 'hPa')).toBe(101325);
      expect(pressureToPa(1000, 'hPa')).toBe(100000);
    });

    test('defaults to hPa when unit is missing', () => {
      expect(pressureToPa(1013.25, '')).toBe(101325);
      expect(pressureToPa(1013.25, null)).toBe(101325);
    });

    test('converts kPa to Pa', () => {
      expect(pressureToPa(101.325, 'kPa')).toBe(101325);
    });

    test('converts inHg to Pa', () => {
      expect(pressureToPa(29.92, 'inHg')).toBeCloseTo(101325, -1);
    });

    test('converts mmHg to Pa', () => {
      expect(pressureToPa(760, 'mmHg')).toBeCloseTo(101325, -1);
    });

    test('handles case-insensitive units', () => {
      expect(pressureToPa(1000, 'HPA')).toBe(100000);
      expect(pressureToPa(101, 'KPA')).toBe(101000);
    });
  });

  describe('rainToM', () => {
    test('converts mm to m', () => {
      expect(rainToM(10, 'mm')).toBeCloseTo(0.01, 4);
      expect(rainToM(100, 'mm')).toBeCloseTo(0.1, 3);
      expect(rainToM(1000, 'mm')).toBe(1);
    });

    test('defaults to mm when unit is missing', () => {
      expect(rainToM(10, '')).toBeCloseTo(0.01, 4);
      expect(rainToM(10, null)).toBeCloseTo(0.01, 4);
    });

    test('converts inches to m', () => {
      expect(rainToM(1, 'in')).toBeCloseTo(0.0254, 4);
      expect(rainToM(10, 'in')).toBeCloseTo(0.254, 3);
    });

    test('handles case-insensitive units', () => {
      expect(rainToM(10, 'MM')).toBeCloseTo(0.01, 4);
      expect(rainToM(1, 'IN')).toBeCloseTo(0.0254, 4);
    });
  });

  describe('rainRateToMs', () => {
    test('converts mm/hr to m/s', () => {
      expect(rainRateToMs(1, 'mm/hr')).toBeCloseTo(1 / 3600000, 8);
      expect(rainRateToMs(3600, 'mm/hr')).toBeCloseTo(0.001, 4);
    });

    test('handles mm/h abbreviation', () => {
      expect(rainRateToMs(1, 'mm/h')).toBeCloseTo(1 / 3600000, 8);
    });

    test('defaults to mm/hr when unit is missing', () => {
      expect(rainRateToMs(1, '')).toBeCloseTo(1 / 3600000, 8);
    });

    test('converts in/hr to m/s', () => {
      expect(rainRateToMs(1, 'in/hr')).toBeCloseTo(0.0254 / 3600, 6);
      expect(rainRateToMs(1, 'in/h')).toBeCloseTo(0.0254 / 3600, 6);
    });

    test('handles case-insensitive units', () => {
      expect(rainRateToMs(1, 'MM/HR')).toBeCloseTo(1 / 3600000, 8);
      expect(rainRateToMs(1, 'IN/HR')).toBeCloseTo(0.0254 / 3600, 6);
    });
  });
});
