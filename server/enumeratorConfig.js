// Operational assignments: enumerator → locations → targets → deadlines
// Source: Field coordination sheet (Nisrine/Ralph)
//
// SECURITY: Phone numbers are read from the ENUMERATOR_PHONES env var when set.
// Format: JSON object keyed by enumerator code, e.g.:
//   ENUMERATOR_PHONES={"AZ01":"71797612","MK10":"81748316",...}
// If env var is not set, the hardcoded values below are used as fallback.
// In production, set ENUMERATOR_PHONES in Railway to keep numbers out of source files.

const _phonesFromEnv = (() => {
  try {
    return process.env.ENUMERATOR_PHONES ? JSON.parse(process.env.ENUMERATOR_PHONES) : null;
  } catch(e) {
    console.warn('[Config] ENUMERATOR_PHONES env var is not valid JSON — using hardcoded fallback');
    return null;
  }
})();

function phone(code, fallback) {
  return (_phonesFromEnv && _phonesFromEnv[code]) || fallback;
}

const ENUMERATOR_ASSIGNMENTS = [
  {
    code: 'AZ01',
    name: 'Ahmad Zaabouty',
    phone: phone('AZ01', '71797612'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'Beirut',
    locations: [
      { name: 'Ain el Mreisseh', target: 34, deadline: '2026-06-08' },
    ],
  },
  {
    code: 'MK10',
    name: 'Majd Khatib',
    phone: phone('MK10', '81748316'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'Beirut',
    locations: [
      { name: 'Mazraa', target: 20, deadline: '2026-06-06' },
    ],
  },
  {
    code: 'AM06',
    name: 'Abed Mohamad',
    phone: phone('AM06', '71646552'),
    entity: 'Jafra',
    governorate: 'Beirut / Mount Lebanon',
    district: 'Beirut / Chouf',
    locations: [
      { name: 'Ras Beirut', target: 47, deadline: '2026-06-12' },
      { name: 'Barja',      target: 20, deadline: '2026-06-08' },
      { name: 'Dibbiyeh',   target: 24, deadline: '2026-06-08' },
      { name: 'Jiyeh',      target: 17, deadline: '2026-06-08' },
      { name: 'Naameh',     target: 13, deadline: '2026-06-08' },
    ],
  },
  {
    code: 'IM07',
    name: 'Iyad Mokdady',
    phone: phone('IM07', '71657053'),
    entity: 'Jafra',
    governorate: 'North',
    district: 'El Minieh-Dennie',
    locations: [
      { name: 'Beddawi',      target: 48, deadline: '2026-06-13' },
      { name: 'Beddawi Camp', target: 71, deadline: '2026-06-13' },
    ],
  },
  {
    code: 'AA08',
    name: 'Abdullah Sayyed',
    phone: phone('AA08', '70859365'),
    entity: 'Jafra',
    governorate: 'North / Akkar',
    district: 'El Minieh-Dennie / Akkar',
    locations: [
      { name: 'Zouk Bhannine',      target: 22, deadline: '2026-06-12' },
      { name: 'Mhammaret',          target: 47, deadline: '2026-06-12' },
      { name: 'Nahr el Bared Camp', target: 29, deadline: '2026-06-12' },
    ],
  },
  {
    code: 'SS02',
    name: 'Samira Shaykha',
    phone: phone('SS02', '71300582'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Shatila Camp', target: 23, deadline: '2026-06-04' },
    ],
  },
  {
    code: 'AM03',
    name: 'Aya Maarouf',
    phone: phone('AM03', '71529437'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Shatila Camp', target: 23, deadline: '2026-06-05' },
    ],
  },
  {
    code: 'HI04',
    name: 'Hanan Issa',
    phone: phone('HI04', '76642085'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Burj el-Barajne Camp', target: 32, deadline: '2026-06-05' },
    ],
  },
  {
    code: 'AW05',
    name: 'Aya Waariyeh',
    phone: phone('AW05', '81069984'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Burj el-Barajne Camp', target: 32, deadline: '2026-06-05' },
    ],
  },
  {
    code: 'GO13',
    name: 'Ghinwa Ouneissi',
    phone: phone('GO13', null),
    governorate: 'North / Mount Lebanon',
    district: 'El Batroun / Jbeil',
    locations: [
      { name: 'Batroun', target: 22, deadline: '2026-06-12' },
      { name: 'Aalmat Ej-Jnoubiyeh', target: 21, deadline: '2026-06-12' },
    ],
  },
  {
    code: 'SO12',
    name: 'Shada Ouneissi',
    phone: phone('SO12', '81658381'),
    entity: 'Through Alaa Abbas',
    governorate: 'Mount Lebanon',
    district: 'Jbeil',
    locations: [],
  },
  {
    code: 'SH15',
    name: 'Shadia El Hassan',
    phone: phone('SH15', '3546362'),
    entity: 'Through Alaa Abbas',
    governorate: 'Mount Lebanon',
    district: 'Aley',
    locations: [],
  },
  {
    code: 'MA16',
    name: 'Mamdouh Achkar',
    phone: phone('MA16', '76398495'),
    entity: 'Through Alaa Abbas',
    governorate: 'Mount Lebanon',
    district: 'Aley',
    locations: [],
  },
  {
    code: 'AH09',
    name: 'Ahmad Abdelhady',
    phone: phone('AH09', '70856946'),
    entity: 'Jafra',
    governorate: 'South',
    district: 'Saida',
    locations: [
      { name: 'Saida Wastany', target: 21, deadline: '2026-06-08' },
      { name: 'Saida Derkman', target: 23, deadline: '2026-06-08' },
    ],
  },
];

module.exports = { ENUMERATOR_ASSIGNMENTS };
