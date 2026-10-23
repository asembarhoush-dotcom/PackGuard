const { utils } = require('../index.js');
const { buildCommonMap, buildPiezoMap } = utils;

describe('buildCommonMap', () => {
  test('extracts values and units from common_list', () => {
    const data = {
      common_list: [
        { id: '0x02', val: '16.4', unit: 'C' },
        { id: '0x03', val: '4.8', unit: 'C' },
        { id: '0x0A', val: '15', unit: 'degrees' },
      ],
    };

    const { map, units } = buildCommonMap(data);

    expect(map['0x02']).toBe(16.4);
    expect(map['0x03']).toBe(4.8);
    expect(map['0x0A']).toBe(15);
    expect(units['0x02']).toBe('C');
    expect(units['0x0A']).toBe('degrees');
  });

  test('handles embedded units in val string', () => {
    const data = {
      common_list: [
        { id: '0x0B', val: '6.22 knots' },
        { id: '0x0C', val: '7.39 knots' },
      ],
    };

    const { map, units } = buildCommonMap(data);

    expect(map['0x0B']).toBe(6.22);
    expect(map['0x0C']).toBe(7.39);
    expect(units['0x0B']).toBe('knots');
    expect(units['0x0C']).toBe('knots');
  });

  test('filters out NaN values (missing sensors)', () => {
    const data = {
      common_list: [
        { id: '0x02', val: '16.4', unit: 'C' },
        { id: '0x03', val: '--', unit: 'C' }, // missing sensor
        { id: '0x0A', val: '15', unit: 'degrees' },
      ],
    };

    const { map } = buildCommonMap(data);

    expect(map['0x02']).toBe(16.4);
    expect(map['0x03']).toBeUndefined(); // filtered out
    expect(map['0x0A']).toBe(15);
  });

  test('handles empty common_list', () => {
    const data = { common_list: [] };
    const { map, units } = buildCommonMap(data);

    expect(Object.keys(map).length).toBe(0);
    expect(Object.keys(units).length).toBe(0);
  });

  test('handles missing common_list', () => {
    const data = {};
    const { map, units } = buildCommonMap(data);

    expect(Object.keys(map).length).toBe(0);
    expect(Object.keys(units).length).toBe(0);
  });

  test('skips items with missing id or val', () => {
    const data = {
      common_list: [
        { id: '0x02', val: '16.4', unit: 'C' },
        { id: '0x03', unit: 'C' }, // missing val
        { val: '15', unit: 'degrees' }, // missing id
        { id: '0x0A', val: '15', unit: 'degrees' },
      ],
    };

    const { map } = buildCommonMap(data);

    expect(Object.keys(map).length).toBe(2);
    expect(map['0x02']).toBe(16.4);
    expect(map['0x0A']).toBe(15);
  });

  test('handles null or undefined common_list', () => {
    expect(buildCommonMap({ common_list: null }).map).toEqual({});
    expect(buildCommonMap({ common_list: undefined }).map).toEqual({});
  });
});

describe('buildPiezoMap', () => {
  test('extracts values and units from piezoRain array', () => {
    const data = {
      piezoRain: [
        { id: '0x0D', val: '0.0 mm' },
        { id: '0x0E', val: '0.0 mm/Hr' },
        { id: 'srain_piezo', val: '0' },
      ],
    };

    const { map, units } = buildPiezoMap(data);

    expect(map['0x0D']).toBe(0);
    expect(map['0x0E']).toBe(0);
    expect(map['srain_piezo']).toBe(0);
    expect(units['0x0D']).toBe('mm');
    expect(units['0x0E']).toBe('mm/Hr');
  });

  test('extracts extra scalar fields (ws90cap_volt, voltage, battery)', () => {
    const data = {
      piezoRain: [
        {
          id: '0x13',
          val: '0',
          battery: 5,
          voltage: 4.8,
          ws90cap_volt: 4.2,
          ws90_ver: 'v1.0.0', // non-numeric, skipped
        },
      ],
    };

    const { map } = buildPiezoMap(data);

    expect(map['battery']).toBe(5);
    expect(map['voltage']).toBe(4.8);
    expect(map['ws90cap_volt']).toBe(4.2);
    expect(map['ws90_ver']).toBeUndefined(); // non-numeric
  });

  test('handles piezoRain as flat object (backwards compatibility)', () => {
    const data = {
      piezoRain: {
        srain_piezo: '10.5',
        '0x0D': '25.3 mm',
        '0x0E': '0.5 mm/Hr',
      },
    };

    const { map, units } = buildPiezoMap(data);

    expect(map['srain_piezo']).toBe(10.5);
    expect(map['0x0D']).toBe(25.3);
    expect(map['0x0E']).toBe(0.5);
    expect(units['0x0D']).toBe('mm');
  });

  test('filters out NaN values', () => {
    const data = {
      piezoRain: [
        { id: '0x0D', val: '10.5 mm' },
        { id: '0x0E', val: '--' }, // missing
        { id: 'srain_piezo', val: '0' },
      ],
    };

    const { map } = buildPiezoMap(data);

    expect(map['0x0D']).toBe(10.5);
    expect(map['0x0E']).toBeUndefined(); // filtered out
    expect(map['srain_piezo']).toBe(0);
  });

  test('handles empty piezoRain array', () => {
    const data = { piezoRain: [] };
    const { map, units } = buildPiezoMap(data);

    expect(Object.keys(map).length).toBe(0);
    expect(Object.keys(units).length).toBe(0);
  });

  test('handles missing piezoRain', () => {
    const data = {};
    const { map, units } = buildPiezoMap(data);

    expect(Object.keys(map).length).toBe(0);
    expect(Object.keys(units).length).toBe(0);
  });

  test('handles piezoRain with mixed valid and invalid entries', () => {
    const data = {
      piezoRain: [
        { id: '0x0D', val: '10.5 mm' },
        { val: '5.5' }, // missing id
        { id: '0x0E' }, // missing val
        { id: 'srain_piezo', val: '0', ws90cap_volt: 4.2 },
      ],
    };

    const { map } = buildPiezoMap(data);

    expect(map['0x0D']).toBe(10.5);
    expect(map['srain_piezo']).toBe(0);
    expect(map['ws90cap_volt']).toBe(4.2);
    expect(Object.keys(map).length).toBe(3);
  });

  test('handles null or undefined piezoRain', () => {
    expect(buildPiezoMap({ piezoRain: null }).map).toEqual({});
    expect(buildPiezoMap({ piezoRain: undefined }).map).toEqual({});
  });

  test('skips non-numeric extra fields', () => {
    const data = {
      piezoRain: [
        {
          id: '0x13',
          val: '0',
          ws90_ver: 'v1.0.0',
          battery_status: 'good',
          voltage: 4.8, // numeric, included
        },
      ],
    };

    const { map } = buildPiezoMap(data);

    expect(map['voltage']).toBe(4.8);
    expect(map['ws90_ver']).toBeUndefined();
    expect(map['battery_status']).toBeUndefined();
  });
});
