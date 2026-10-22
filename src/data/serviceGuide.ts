/**
 * Resident Service Guide: the content behind the panel that opens when a resident clicks a civic
 * building on the map. Built-in steps only (no AI service), so it works offline.
 *
 * Facts that change over time (fees, office hours, phone numbers, online portal steps) are NOT stated
 * here. Each service tells the resident to confirm them on the official site or at the counter first.
 */

export interface GuideQuestion {
  q: string;
  /** shown when the answer is "no" */
  noAdvice: string;
}

export interface GuideService {
  /** map label name this guide is opened from (the place name in the data) */
  place: string;
  title: string;
  /** two or three plain sentences */
  what: string;
  emergency?: string;
  eligibility: GuideQuestion[];
  checklist: string[];
  /** draft fields the resident fills in and reviews; nothing here is sent anywhere */
  drafts: { label: string; hint: string }[];
  submit: string[];
  verify: string;
}

export const SERVICES: GuideService[] = [
  {
    place: 'Tasheel Centre',
    title: 'Tasheel: typing and government transactions',
    what: 'Tasheel centres handle typing and government transactions, such as visa and Emirates ID steps and document attestation. A typing centre prepares the forms and submits them for you on the official system.',
    eligibility: [
      { q: 'Do you already have a valid passport and a current visa or residence reason to apply?', noAdvice: 'Start with the passport and the reason for the visa or residence. The centre cannot file without them.' },
      { q: 'Is the transaction for you (not for someone else who needs a power of attorney)?', noAdvice: 'Someone applying for another person needs that person’s documents and a valid power of attorney.' },
    ],
    checklist: [
      'Passport (original and a copy of the main page)',
      'Emirates ID (if you already have one)',
      'Passport-size photo, if the transaction needs one',
      'Current residence or visa document, if applicable',
      'Attested or original documents for the transaction (for example a marriage or education certificate)',
    ],
    drafts: [
      { label: 'Transaction you need', hint: 'e.g. new visa, Emirates ID renewal, document attestation' },
      { label: 'Document list you hold', hint: 'list the documents you have, one per line' },
    ],
    submit: [
      'Go to a Tasheel typing centre in Al Sajaa or on the official Sharjah government services site.',
      'Ask the typing counter to confirm the fee and the required documents before you pay.',
    ],
    verify: 'Fees, office hours and the required documents change. Confirm them on the official Tasheel or Sharjah government site, or at the counter, before you go.',
  },
  {
    place: 'Al Sajaa Hospital',
    title: 'Medical centre: booking and what to bring',
    what: 'The medical centre handles booking for routine appointments and follow-ups. It is not a substitute for emergency care.',
    emergency: 'If someone has chest pain, trouble breathing, heavy bleeding, loss of consciousness, a stroke-like symptom or severe injury, call 998 (ambulance) now or go to the nearest emergency department. Do not wait for a booking.',
    eligibility: [
      { q: 'Is this a routine appointment (not an emergency)?', noAdvice: 'Call 998 for an ambulance or go to the nearest emergency department now.' },
      { q: 'Do you have an Emirates ID or a health insurance card?', noAdvice: 'Bring any other ID you have and ask the reception what they accept.' },
    ],
    checklist: [
      'Emirates ID (or passport)',
      'Health insurance card, if you have one',
      'List of current medicines and any allergies',
      'Previous medical reports or prescriptions relevant to the visit',
      'Payment method the clinic accepts',
    ],
    drafts: [
      { label: 'Reason for the visit', hint: 'describe the main concern in your own words, without a diagnosis' },
      { label: 'Preferred date and time', hint: 'the time window that suits you' },
    ],
    submit: [
      'Book by calling the hospital or using the official booking channel shown on its official page.',
      'Confirm the appointment time, the fee and what to bring when you book.',
    ],
    verify: 'Clinic hours, booking channels and fees change. Confirm them on the hospital’s official page or by phone before you go.',
  },
  {
    place: 'Court (to be placed manually)',
    title: 'Court: finding the right court and forms',
    what: 'The court handles civil, family and other legal matters. Finding the right court depends on the type of case, so confirm it at the court’s help desk.',
    eligibility: [
      { q: 'Is your matter a court case (not a police complaint or a Tasheel transaction)?', noAdvice: 'For a police matter go to the police station. For a transaction go to Tasheel.' },
      { q: 'Have you already received a court notice or a case number?', noAdvice: 'Without a case number, ask the court help desk which department to contact.' },
    ],
    checklist: [
      'Emirates ID or passport',
      'Any notice, summons or letter you received',
      'Case number, if you already have one',
      'Documents that support your side of the matter',
    ],
    drafts: [
      { label: 'Short summary of the matter', hint: 'facts only: what happened, when, and who is involved' },
      { label: 'What you are asking for', hint: 'the outcome you want, in one or two sentences' },
    ],
    submit: [
      'Visit the court’s help desk or check the official court website for the right department and forms.',
      'For legal advice on your options, speak to a qualified lawyer.',
    ],
    verify: 'Court departments, forms and fees change. Confirm them with the court’s official help desk or website before you file.',
  },
  {
    place: 'Police Station (to be placed manually)',
    title: 'Police station: non-emergency complaints',
    what: 'A non-emergency complaint is a report about something that has already happened and is not an active emergency. The police station records the report and tells you the next step.',
    emergency: 'If a crime is happening now or someone is in danger, call 999 (police) first.',
    eligibility: [
      { q: 'Is the situation over (not happening now)?', noAdvice: 'Call 999 now.' },
      { q: 'Do you know the basic details: when, where and who?', noAdvice: 'Write down what you remember now. Missing details can be added at the station.' },
    ],
    checklist: [
      'Emirates ID or passport',
      'Any evidence you have (photos, messages, receipts, reference numbers)',
      'Names and contact details of anyone involved or witnessing',
      'Date, time and place of the incident',
    ],
    drafts: [
      { label: 'What happened', hint: 'the facts in order: what, when, where, who. No guesses.' },
      { label: 'Evidence you have', hint: 'list each item and what it shows' },
    ],
    submit: [
      'Go to the police station, or use the official Sharjah Police website or app if a non-emergency online report is offered.',
      'Confirm the non-emergency number on the official police website before calling.',
    ],
    verify: 'Reporting channels and numbers change. Confirm them on the official Sharjah Police website before you go.',
  },
];

export const SERVICE_BY_PLACE = new Map(SERVICES.map((s) => [s.place, s]));
