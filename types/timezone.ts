export const TIMEZONES = {
  UTC: 'UTC',
  GMT: 'GMT',

  // Asia
  KST: 'Asia/Seoul',
  JST: 'Asia/Tokyo',
  CST_CN: 'Asia/Shanghai',
  HKT: 'Asia/Hong_Kong',
  SGT: 'Asia/Singapore',
  IST: 'Asia/Kolkata',
  TWT: 'Asia/Taipei',

  // US
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  PT: 'America/Los_Angeles',

  // Europe
  UK: 'Europe/London',
  CET: 'Europe/Berlin',
  FR: 'Europe/Paris',
  NL: 'Europe/Amsterdam',
  CH: 'Europe/Zurich',

  // Others
  AEST: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  BRT: 'America/Sao_Paulo',
} as const;

export type Timezone = (typeof TIMEZONES)[keyof typeof TIMEZONES];
