import { formatFileName } from '../formatFileName';

describe('formatFileName(fileName)', () => {
  it('returns empty string as is', () => {
    expect(formatFileName('')).toBe('');
  });

  it('returns a relative path unchanged', () => {
    expect(formatFileName('pkg/server.go')).toBe('pkg/server.go');
  });

  it('moves the leading slash of an absolute path to the end', () => {
    expect(formatFileName('/usr/bin/pyroscope')).toBe('usr/bin/pyroscope/');
  });

  it('strips the [kernel] prefix', () => {
    expect(formatFileName('[kernel] vmlinux')).toBe('vmlinux');
  });

  it('strips the [kernel] prefix and then handles the leading slash', () => {
    expect(formatFileName('[kernel] /lib/modules/foo.ko')).toBe('lib/modules/foo.ko/');
  });
});