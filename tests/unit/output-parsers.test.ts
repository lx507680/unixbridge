import { describe, expect, it } from 'vitest'
import { parseDfOutput, parseLsOutput, parsePsOutput } from '../../src/core/commands/output-parsers'

describe('regex output adapters', () => {
  it('extracts ls rows without splitting filenames that contain spaces', () => {
    const raw = [
      'total 16',
      '-rw-r--r--@  1 luoxian  staff  1765 Nov  9 16:09 my report.txt',
      'lrwxr-xr-x@  1 luoxian  staff    24 Dec 21  2021 my.cnf -> /etc/alternatives/my.cnf'
    ].join('\n')

    expect(parseLsOutput(raw)).toEqual([
      {
        mode: '-rw-r--r--@',
        links: '1',
        owner: 'luoxian',
        group: 'staff',
        size: '1765',
        mtime: 'Nov  9 16:09',
        name: 'my report.txt'
      },
      {
        mode: 'lrwxr-xr-x@',
        links: '1',
        owner: 'luoxian',
        group: 'staff',
        size: '24',
        mtime: 'Dec 21  2021',
        name: 'my.cnf -> /etc/alternatives/my.cnf'
      }
    ])
  })

  it('keeps the remainder of a ps aux command instead of splitting on spaces', () => {
    const raw = [
      'USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND',
      'luoxian 42 0.1 0.2 3456 789 ?? Ss 4:51PM 0:00.33 /bin/zsh -l -c echo hello'
    ].join('\n')

    expect(parsePsOutput(raw)[0]).toMatchObject({
      PID: '42',
      COMMAND: '/bin/zsh -l -c echo hello'
    })
  })

  it('parses both Linux df rows and macOS inode columns', () => {
    const linux = 'My Disk   100G   50G    40G    56%    /Volumes/My Share'
    const mac = '/dev/disk3s1s1   460Gi    12Gi    38Gi    24%    459k  402M    0%   /'

    expect(parseDfOutput(linux)[0]).toMatchObject({
      Filesystem: 'My Disk',
      'Use%': '56%',
      'Mounted-on': '/Volumes/My Share'
    })
    expect(parseDfOutput(mac)[0]).toMatchObject({
      Filesystem: '/dev/disk3s1s1',
      'Use%': '24%',
      'Mounted-on': '/'
    })
  })
})
