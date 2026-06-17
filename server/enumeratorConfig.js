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
    // Covers all Beirut localities (Moussaytbeh/Ras Beyrouth/Mazraa/Ain el-Mreisseh),
    // splitting the 178 Beirut total with Majd Khatib (89 each). No per-locality split given.
    locations: [
      { name: 'Beirut (all localities)', target: 89, district: 'Beirut' },
    ],
  },
  {
    code: 'MK10',
    name: 'Majd Khatib',
    phone: phone('MK10', '81748316'),
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'Beirut',
    // Covers all Beirut localities, splitting the 178 Beirut total with Ahmad Zaabouty (89 each).
    locations: [
      { name: 'Beirut (all localities)', target: 89, district: 'Beirut' },
    ],
  },
  {
    code: 'AM06',
    name: 'Abed Mohamad',
    phone: phone('AM06', '71646552'),
    entity: 'Jafra',
    governorate: 'Mount Lebanon',
    district: 'Chouf',
    locations: [
      { name: 'Naameh',   target: 13, district: 'Chouf', deadline: '2026-06-08' },
      { name: 'Jiyeh',    target: 17, district: 'Chouf', deadline: '2026-06-08' },
      { name: 'Dibbiyeh', target: 24, district: 'Chouf', deadline: '2026-06-08' },
      { name: 'Barja',    target: 20, district: 'Chouf', deadline: '2026-06-08' },
    ],
  },
  {
    code: 'IM07',
    name: 'Iyad Mokdady',
    phone: phone('IM07', '71657053'),
    entity: 'Jafra',
    governorate: 'North',
    district: 'North',
    locations: [
      { name: 'Beddawi',      target: 48, district: 'North', deadline: '2026-06-13' },
      { name: 'Beddawi Camp', target: 71, district: 'North', deadline: '2026-06-13' },
    ],
  },
  {
    code: 'AA08',
    name: 'Abdullah Sayyed',
    phone: phone('AA08', '70859365'),
    entity: 'Jafra',
    governorate: 'North / Akkar',
    district: 'North / Akkar',
    locations: [
      { name: 'Zouk Bhannine',      target: 22, district: 'North', deadline: '2026-06-12' },
      { name: 'Mhammaret',          target: 47, district: 'Akkar', deadline: '2026-06-12' },
      { name: 'Nahr el Bared Camp', target: 29, district: 'North', deadline: '2026-06-12' },
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
      { name: 'Shatila Camp', target: 18, deadline: '2026-06-04' },
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
      { name: 'Shatila Camp', target: 18, deadline: '2026-06-05' },
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
    phone: phone('GO13', '3724473'),
    governorate: 'Mount Lebanon / North',
    district: 'Jbeil / El Batroun',
    locations: [
      { name: 'Lassa',   target: 24, governorate: 'Mount Lebanon', district: 'Jbeil' },
      { name: 'Batroun', target: 22, governorate: 'North',         district: 'El Batroun' },
    ],
  },
  {
    code: 'SO12',
    name: 'Shada Ouneissi',
    phone: phone('SO12', '81658381'),
    entity: 'Through Alaa Abbas',
    governorate: 'Mount Lebanon',
    district: 'Jbeil',
    locations: [
      { name: 'Lassa',                target: 25, district: 'Jbeil' },
      { name: 'Aalmat Ech-Chamliyeh', target: 25, district: 'Jbeil' },
      { name: 'Aalmat Ej-Jnoubiyeh',  target: 21, district: 'Jbeil' },
    ],
  },
  {
    code: 'MAK16',
    name: 'Mostafa Khatib',
    phone: phone('MAK16', '70637021'),
    governorate: 'Mount Lebanon',
    district: 'Aley',
    locations: [
      { name: 'Bchamoun',                target: 21, district: 'Aley' },
      { name: 'Choueifat El-Quoubbeh',   target: 12, district: 'Aley' },
      { name: 'Keyfoun',                 target: 8,  district: 'Aley' },
    ],
  },
  {
    code: 'MM11',
    name: 'Mohammad Midani',
    phone: phone('MM11', '76987431'),
    governorate: 'Mount Lebanon',
    district: 'Aley',
    locations: [
      { name: 'Bchamoun',                target: 20, district: 'Aley' },
      { name: 'Choueifat El-Quoubbeh',   target: 12, district: 'Aley' },
      { name: 'Keyfoun',                 target: 8,  district: 'Aley' },
    ],
  },
  {
    code: 'NK14',
    name: 'Nour Kamel',
    phone: phone('NK14', '70912714'),
    governorate: 'Mount Lebanon',
    district: 'Aley',
    locations: [
      { name: 'Bchamoun', target: 17, district: 'Aley' },
    ],
  },
  {
    code: 'AH09',
    name: 'Ahmad Abdelhady',
    phone: phone('AH09', '70856946'),
    entity: 'Jafra',
    governorate: 'South',
    district: 'Saida',
    locations: [
      { name: 'Saida El-Oustani',   target: 21, district: 'Saida', deadline: '2026-06-08' },
      { name: 'Saida Ed-Dekermane', target: 23, district: 'Saida', deadline: '2026-06-08' },
    ],
  },
  {
    code: 'TM20',
    name: 'Toni Mourani',
    phone: phone('TM20', '70006655'),
    governorate: 'Bekaa',
    district: 'Rachaya',
    locations: [
      { name: 'Kfarmeshki', target: 25, district: 'Rachaya' },
    ],
  },
  {
    code: 'CG21',
    name: 'Adham Jamal',
    phone: phone('CG21', '71693260'),
    governorate: 'Bekaa',
    district: 'Rachaya',
    locations: [
      { name: 'Daher el-Ahmar', target: 15, district: 'Rachaya' },
    ],
  },
  {
    code: 'WA22',
    name: 'Tarek Saidy',
    phone: phone('WA22', '79300985'),
    governorate: 'Bekaa',
    district: 'Rachaya',
    locations: [
      { name: 'Rachaya', target: 5, district: 'Rachaya' },
    ],
  },
  {
    code: 'HK23',
    name: 'Halim Kaii',
    phone: phone('HK23', '71908554'),
    governorate: 'Bekaa',
    district: 'Rachaya',
    locations: [
      { name: 'Kaukaba', target: 5, district: 'Rachaya' },
    ],
  },
];

module.exports = { ENUMERATOR_ASSIGNMENTS };
