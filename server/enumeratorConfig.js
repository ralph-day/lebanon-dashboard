// Operational assignments: enumerator → locations → targets → deadlines
// Source: Field coordination sheet (Nisrine/Ralph)

const ENUMERATOR_ASSIGNMENTS = [
  {
    code: 'AZ01',
    name: 'Ahmad Zaabouty',
    phone: '71797612',
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
    phone: '81748316',
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
    phone: '71646552',
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
    phone: '71657053',
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
    phone: '70859365',
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
    phone: '71300582',
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Shatila Camp', target: 36, deadline: '2026-06-04' },
    ],
  },
  {
    code: 'AM03',
    name: 'Aya Maarouf',
    phone: '71529437',
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Chatila Camp', target: 36, deadline: '2026-06-05' },
    ],
  },
  {
    code: 'HI04',
    name: 'Hanan Issa',
    phone: '76642085',
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
    phone: '81069984',
    entity: 'Jafra',
    governorate: 'Beirut',
    district: 'P Camp',
    locations: [
      { name: 'Burj El Barajneh Camp', target: 32, deadline: '2026-06-05' },
    ],
  },
  {
    code: 'AH09',
    name: 'Ahmad Abdelhady',
    phone: '70856946',
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
