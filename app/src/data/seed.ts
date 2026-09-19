export const DEPARTMENTS = [
  { id: 1, code: 'EMAC', name: 'Emergency & Acute Care', description: 'Emergency departments, urgent care and clinical decision units', isActive: true, createdAt: '2026-01-01' },
  { id: 2, code: 'SURG', name: 'Surgical & Perioperative Services', description: 'Operating rooms, recovery and day surgery', isActive: true, createdAt: '2026-01-01' },
  { id: 3, code: 'CRIT', name: 'Critical Care & Intensive Services', description: 'ICU, NICU, PICU, CCU and high-dependency units', isActive: true, createdAt: '2026-01-01' },
  { id: 4, code: 'GNSP', name: 'General & Specialty Services', description: 'Inpatient wards, outpatient clinics and specialty units', isActive: true, createdAt: '2026-01-01' },
  { id: 5, code: 'CORP', name: 'Administrative & Corporate Services', description: 'Nursing admin, HR, infection control and support services', isActive: true, createdAt: '2026-01-01' },
];

/**
 * Sentinel value, deliberately NOT a row in NURSING_UNITS. "Unassigned" means the
 * employee exists but has not been placed in a unit yet. Adding it to the
 * directory would break the seeded baseline the specification asserts (47 nursing
 * units / 582 beds) and that `verify_integration.py` F-01 machine-checks, and it
 * would put a bedless pseudo-unit into the Hospital Master Unit Directory.
 */
export const UNASSIGNED_UNIT_ID = 0;

/**
 * The onboarding form starts on SN — Staff Nurse: the frontline clinical position
 * (active, tier Clinical, schedulable, displayOrder 10), which is what most
 * onboardings are. HR can still pick any active position.
 */
export const DEFAULT_ONBOARD_POSITION = 'SN';

export const NURSING_UNITS = [
  // EMAC 133
  { id: 1, code: 'ER_MAIN', name: 'ER Main / Adult', departmentId: 1, bedCount: 39, isActive: true, description: 'Primary triage and emergency care for adults' },
  { id: 2, code: 'ER_MC', name: 'ER M&C', departmentId: 1, bedCount: 32, isActive: true, description: 'Emergency care for Mothers and Children' },
  { id: 3, code: 'UCC', name: 'Urgent Care Center', departmentId: 1, bedCount: 15, isActive: true, description: 'Urgent care for non-life-threatening needs' },
  { id: 4, code: 'CDU', name: 'Clinical Decision Unit', departmentId: 1, bedCount: 32, isActive: true, description: 'Observation unit for clinical decisions' },
  { id: 5, code: 'ER_COORD', name: 'ER Coordinator', departmentId: 1, bedCount: 0, isActive: true, description: 'Patient flow and resource management' },
  { id: 6, code: 'ED_NAV', name: 'ED Navigation', departmentId: 1, bedCount: 8, isActive: true, description: 'Patient routing and intake' },
  { id: 7, code: 'ED_ADMIN', name: 'ED Admin', departmentId: 1, bedCount: 7, isActive: true, description: 'Clerical support for Emergency Department' },
  // SURG 38
  { id: 8, code: 'OR', name: 'Operating Room', departmentId: 2, bedCount: 12, isActive: true, description: 'Sterile surgical suites' },
  { id: 9, code: 'OR_COORD', name: 'OR Coordinator', departmentId: 2, bedCount: 0, isActive: true, description: 'Surgical scheduling and theater flow' },
  { id: 10, code: 'PACU', name: 'Recovery / PACU', departmentId: 2, bedCount: 8, isActive: true, description: 'Post-Anesthesia Care Unit' },
  { id: 11, code: 'DAY_SURG', name: 'Day Surgery', departmentId: 2, bedCount: 9, isActive: true, description: 'Same-day surgical procedures' },
  { id: 12, code: 'PLASTER', name: 'Plaster Unit', departmentId: 2, bedCount: 9, isActive: true, description: 'Orthopedic casting and splinting' },
  // CRIT 165
  { id: 13, code: 'ICU_MAIN', name: 'ICU Main', departmentId: 3, bedCount: 79, isActive: true, description: 'Intensive care for critically ill adults' },
  { id: 14, code: 'ICU_EXT', name: 'ICU Extension', departmentId: 3, bedCount: 28, isActive: true, description: 'Overflow critical care capacity' },
  { id: 15, code: 'NICU', name: 'Neonatal Intensive Care', departmentId: 3, bedCount: 15, isActive: true, description: 'Neonatal intensive care' },
  { id: 16, code: 'PICU', name: 'Pediatric Intensive Care', departmentId: 3, bedCount: 15, isActive: true, description: 'Pediatric intensive care' },
  { id: 17, code: 'CCU', name: 'Coronary Care Unit', departmentId: 3, bedCount: 10, isActive: true, description: 'Cardiac intensive care' },
  { id: 18, code: 'BURN_ICU', name: 'Burn ICU', departmentId: 3, bedCount: 6, isActive: true, description: 'Specialized care for burn trauma' },
  { id: 19, code: 'ASU', name: 'Acute Stabilization Unit', departmentId: 3, bedCount: 6, isActive: true, description: 'Acute stabilization' },
  { id: 20, code: 'HDU', name: 'High Dependency Unit', departmentId: 3, bedCount: 6, isActive: true, description: 'Step-down unit' },
  // GNSP 246
  { id: 21, code: 'INP_WARDS', name: 'Inpatient Wards', departmentId: 4, bedCount: 98, isActive: true, description: 'General and specialized acute care (3A–5B)' },
  { id: 22, code: 'AKU', name: 'Allergy and Kidney Unit', departmentId: 4, bedCount: 14, isActive: true, description: 'Allergy and kidney unit' },
  { id: 23, code: 'REHAB', name: 'Rehabilitation', departmentId: 4, bedCount: 17, isActive: true, description: 'Rehabilitation and physical therapy' },
  { id: 24, code: 'PEDIA', name: 'Pediatric Inpatient', departmentId: 4, bedCount: 15, isActive: true, description: 'Inpatient pediatric care' },
  { id: 25, code: 'LND', name: 'Labor and Delivery', departmentId: 4, bedCount: 15, isActive: true, description: 'Labor and delivery' },
  { id: 26, code: 'OBGYNE', name: 'Obstetrics & Gynecology', departmentId: 4, bedCount: 17, isActive: true, description: 'Obstetrics and gynecology' },
  { id: 27, code: 'NBS', name: 'Newborn Screening', departmentId: 4, bedCount: 3, isActive: true, description: 'Newborn screening unit' },
  { id: 28, code: 'OPD_DENTAL', name: 'OPD / Dental', departmentId: 4, bedCount: 23, isActive: true, description: 'Outpatient clinics' },
  { id: 29, code: 'JAIL', name: 'Jail Ward', departmentId: 4, bedCount: 12, isActive: true, description: 'Secured unit for incarcerated patients' },
  { id: 30, code: 'RRT', name: 'Respiratory Rehab', departmentId: 4, bedCount: 5, isActive: true, description: 'Respiratory rehabilitation therapy' },
  { id: 31, code: 'ECHO_EEG', name: 'ECHO / EEG', departmentId: 4, bedCount: 2, isActive: true, description: 'Diagnostic electrical testing' },
  { id: 32, code: 'ENDO', name: 'Endoscopy', departmentId: 4, bedCount: 5, isActive: true, description: 'GI visual diagnostics' },
  { id: 33, code: 'RADIOLOGY', name: 'Radiology', departmentId: 4, bedCount: 6, isActive: true, description: 'Imaging services (X-Ray/CT/MRI)' },
  { id: 34, code: 'BLOOD_BANK', name: 'Blood Bank', departmentId: 4, bedCount: 2, isActive: true, description: 'Blood storage and donation' },
  { id: 35, code: 'LAB', name: 'Laboratory', departmentId: 4, bedCount: 0, isActive: true, description: 'Clinical pathology diagnostics' },
  { id: 36, code: 'DIABETIC', name: 'Diabetic Center', departmentId: 4, bedCount: 10, isActive: true, description: 'Specialized diabetes management' },
  { id: 37, code: 'DISCHARGE', name: 'Discharge Lounge', departmentId: 4, bedCount: 2, isActive: true, description: 'Transition area for departing patients' },
  // CORP 0
  { id: 38, code: 'NURS_ADMIN', name: 'Nursing Admin', departmentId: 5, bedCount: 0, isActive: true, description: 'Nursing staff management' },
  { id: 39, code: 'HR', name: 'Human Resources', departmentId: 5, bedCount: 0, isActive: true, description: 'Human resources and payroll' },
  { id: 40, code: 'IC', name: 'Infection Control', departmentId: 5, bedCount: 0, isActive: true, description: 'Infection control' },
  { id: 41, code: 'PAT_EXP', name: 'Patient Experience', departmentId: 5, bedCount: 0, isActive: true, description: 'Patient satisfaction and feedback' },
  { id: 42, code: 'PAT_AFFAIRS', name: 'Patient Affairs', departmentId: 5, bedCount: 0, isActive: true, description: 'Admissions and patient rights' },
  { id: 43, code: 'ACADEMIC', name: 'Academic Affairs', departmentId: 5, bedCount: 0, isActive: true, description: 'Medical education and training' },
  { id: 44, code: 'BIZ_CENTER', name: 'Business Center', departmentId: 5, bedCount: 0, isActive: true, description: 'Finance and billing' },
  { id: 45, code: 'IDARA', name: 'Idara', departmentId: 5, bedCount: 0, isActive: true, description: 'General management office' },
  { id: 46, code: 'STORE', name: 'Store', departmentId: 5, bedCount: 0, isActive: true, description: 'Supply chain and inventory' },
  { id: 47, code: 'HOME_CARE', name: 'Home Care', departmentId: 5, bedCount: 0, isActive: true, description: 'Coordination of home-based medical care' },
];

export const POSITIONS = [
  { code: 'DON', fullTitle: 'Director of Nursing', tier: 'Executive', isSchedulable: false, isActive: true, displayOrder: 1, description: 'Executive leadership, strategic planning, and overall clinical governance.' },
  { code: 'DEPUTY_DON', fullTitle: 'Deputy Director of Nursing', tier: 'Executive', isSchedulable: false, isActive: true, displayOrder: 2, description: 'Operational management and implementation of nursing standards.' },
  { code: 'ADMIN', fullTitle: 'Administrator', tier: 'Administrative', isSchedulable: false, isActive: true, displayOrder: 3, description: 'Non-clinical operations, budgeting, staffing schedules, and procurement.' },
  { code: 'NS', fullTitle: 'Nursing Supervisor', tier: 'Management', isSchedulable: true, isActive: true, displayOrder: 4, description: 'Multi-unit shift coordination and resource allocation.' },
  { code: 'ACTING_HEAD', fullTitle: 'Acting Head Nurse', tier: 'Management', isSchedulable: true, isActive: true, displayOrder: 5, description: 'Temporary leadership of a unit to ensure continuity of care and management.' },
  { code: 'NURSE_EDUCATOR', fullTitle: 'Clinical Nurse Educator', tier: 'Specialist', isSchedulable: true, isActive: true, displayOrder: 6, description: 'Staff training, onboarding, and maintaining clinical competency.' },
  { code: 'PRACTITIONER', fullTitle: 'Nurse Practitioner', tier: 'Advanced Practice', isSchedulable: true, isActive: true, displayOrder: 7, description: 'Advanced practice nurse capable of diagnostics and prescribing.' },
  { code: 'HN', fullTitle: 'Head Nurse', tier: 'Management', isSchedulable: true, isActive: true, displayOrder: 8, description: 'Unit-specific management, staff oversight, and quality control.' },
  { code: 'CN', fullTitle: 'Charge Nurse', tier: 'Clinical Lead', isSchedulable: true, isActive: true, displayOrder: 9, description: 'Shift-lead responsible for patient assignments and immediate unit needs.' },
  { code: 'SN', fullTitle: 'Staff Nurse', tier: 'Clinical', isSchedulable: true, isActive: true, displayOrder: 10, description: 'Frontline registered nurse providing direct bedside patient care.' },
  { code: 'PCT', fullTitle: 'Patient Care Technician', tier: 'Support', isSchedulable: true, isActive: true, displayOrder: 11, description: 'Support staff providing basic patient care, vitals, and hygiene.' },
  { code: 'TEC', fullTitle: 'Technician', tier: 'Support', isSchedulable: true, isActive: true, displayOrder: 12, description: 'Technical support staff. Legacy position retained for existing records.' },
  { code: 'HCA', fullTitle: 'Healthcare Assistant', tier: 'Support', isSchedulable: true, isActive: true, displayOrder: 13, description: 'Healthcare support assistant. Legacy position retained for existing records.' },
  { code: 'MW', fullTitle: 'Midwife', tier: 'Clinical Specialist', isSchedulable: true, isActive: true, displayOrder: 14, description: 'Specialist midwifery practitioner. Legacy position retained for existing records.' },
  { code: 'AHN', fullTitle: 'Acting/Assistant Head Nurse', tier: 'Management', isSchedulable: true, isActive: false, displayOrder: 99, description: 'Deprecated — migrate to ACTING_HEAD.' },
  { code: 'CI', fullTitle: 'Clinical Instructor', tier: 'Specialist', isSchedulable: true, isActive: false, displayOrder: 98, description: 'Deprecated — migrate to NURSE_EDUCATOR.' },
];

export const CREDENTIAL_CATEGORIES = [
  { code: 'IDENTITY', name: 'Identity & Legal', description: 'Government-issued identification and legal residency documents', displayOrder: 1 },
  { code: 'LICENSURE', name: 'Licensure', description: 'Professional and national practice licenses', displayOrder: 2 },
  { code: 'LIABILITY', name: 'Liability & Clearance', description: 'Employment contracts, insurance and background clearances', displayOrder: 3 },
  { code: 'COMPETENCY', name: 'Clinical Competency', description: 'Clinical skills assessments and specialized certifications', displayOrder: 4 },
  { code: 'LIFE_SUPPORT', name: 'Life Support', description: 'Emergency and life-saving certifications', displayOrder: 5 },
];

export const CREDENTIAL_TEMPLATES = [
  { id: 1, code: 'PASSPORT', name: 'Passport', categoryCode: 'IDENTITY', hasExpiry: true, requiresUpload: true, description: 'International passport', fields: [{ key: 'passport_number', label: 'Passport Number', type: 'text', required: true }, { key: 'issuing_country', label: 'Issuing Country', type: 'country', required: true }, { key: 'issue_date', label: 'Issue Date', type: 'date', required: true, isIssueDate: true }, { key: 'expiry_date', label: 'Expiry Date', type: 'date', required: true, isExpiryDate: true }], displayOrder: 1, isActive: true },
  { id: 2, code: 'IQAMA', name: 'Resident ID (Iqama)', categoryCode: 'IDENTITY', hasExpiry: true, requiresUpload: true, description: 'Saudi Iqama', fields: [{ key: 'iqama_number', label: 'Iqama Number', type: 'text', required: true }, { key: 'sponsor', label: 'Sponsor/Employer', type: 'text', required: true }, { key: 'issue_date', label: 'Issue Date', type: 'date', required: true, isIssueDate: true }, { key: 'expiry_date', label: 'Expiry Date', type: 'date', required: true, isExpiryDate: true }], displayOrder: 2, isActive: true },
  { id: 3, code: 'HOSPITAL_ID', name: 'Hospital ID', categoryCode: 'IDENTITY', hasExpiry: true, requiresUpload: true, description: 'Hospital ID card', fields: [{ key: 'employee_id_number', label: 'Employee ID Number', type: 'text', required: true }, { key: 'department', label: 'Department/Cost Center', type: 'text', required: true }], displayOrder: 3, isActive: true },
  { id: 4, code: 'PROF_LICENSE', name: 'Professional License', categoryCode: 'LICENSURE', hasExpiry: true, requiresUpload: true, description: 'Professional license', fields: [{ key: 'license_number', label: 'License Number', type: 'text', required: true }, { key: 'issuing_board', label: 'Issuing Board', type: 'text', required: true }], displayOrder: 4, isActive: true },
  { id: 5, code: 'SCFHS', name: 'Saudi Council License', categoryCode: 'LICENSURE', hasExpiry: true, requiresUpload: true, description: 'SCFHS registration', fields: [{ key: 'scfhs_number', label: 'SCFHS Registration Number', type: 'text', required: true }, { key: 'classification', label: 'Professional Classification', type: 'select', required: true }], displayOrder: 5, isActive: true },
  { id: 6, code: 'EMP_CONTRACT', name: 'Employment Contract', categoryCode: 'LIABILITY', hasExpiry: true, requiresUpload: true, description: 'Employment contract doc', fields: [], displayOrder: 6, isActive: true },
  { id: 7, code: 'MALPRACTICE', name: 'Medical Malpractice', categoryCode: 'LIABILITY', hasExpiry: true, requiresUpload: true, description: 'Malpractice insurance', fields: [], displayOrder: 7, isActive: true },
  { id: 8, code: 'CLEARANCE', name: 'Staff Clearance', categoryCode: 'LIABILITY', hasExpiry: false, requiresUpload: true, description: 'Clearance form', fields: [], displayOrder: 8, isActive: true },
  { id: 9, code: 'CORE_COMP', name: 'Core Generic Competency', categoryCode: 'COMPETENCY', hasExpiry: true, requiresUpload: true, description: 'Core competency assessment', fields: [], displayOrder: 9, isActive: true },
  { id: 10, code: 'UNIT_COMP', name: 'Unit Specific Competency', categoryCode: 'COMPETENCY', hasExpiry: true, requiresUpload: true, description: 'Unit competency', fields: [], displayOrder: 10, isActive: true },
  { id: 11, code: 'SEDATION', name: 'Conscious Sedation', categoryCode: 'COMPETENCY', hasExpiry: true, requiresUpload: true, description: 'Conscious sedation cert', fields: [], displayOrder: 11, isActive: true },
  { id: 12, code: 'BLS', name: 'BLS', categoryCode: 'LIFE_SUPPORT', hasExpiry: true, requiresUpload: true, description: 'Basic Life Support', fields: [], displayOrder: 12, isActive: true },
  { id: 13, code: 'ACLS', name: 'ACLS', categoryCode: 'LIFE_SUPPORT', hasExpiry: true, requiresUpload: true, description: 'Advanced Cardiac Life Support', fields: [], displayOrder: 13, isActive: true },
  { id: 14, code: 'PALS', name: 'PALS', categoryCode: 'LIFE_SUPPORT', hasExpiry: true, requiresUpload: true, description: 'Pediatric Advanced Life Support', fields: [], displayOrder: 14, isActive: true },
  { id: 15, code: 'NRP', name: 'NRP', categoryCode: 'LIFE_SUPPORT', hasExpiry: true, requiresUpload: true, description: 'Neonatal Resuscitation Program', fields: [], displayOrder: 15, isActive: true },
  { id: 16, code: 'BICSL', name: 'BICSL', categoryCode: 'LIFE_SUPPORT', hasExpiry: true, requiresUpload: true, description: 'Basic Infection Control Skills License', fields: [], displayOrder: 16, isActive: true },
];

export const EMPLOYEES_SEED = [
  { id: 1, firstName: 'Sarah', middleName: 'Ahmed', lastName: 'Al-Harbi', name: 'Sarah Ahmed Al-Harbi', jobNumber: '1001', jobTitle: 'Registered Nurse', fileNo: '1001', rankGrade: 'Grade 7', nationality: 'Saudi', jobPostLocation: 'Buraydah', actualWorkPlace: 'ICU Main', specialty: 'Critical Care', maritalStatus: 'Single', salary: 8500, unitId: 13, position: 'SN', contactEmail: 'sarah.ahmed@aigh.sa', status: 'Active', hireDate: '2023-01-15' },
  { id: 2, firstName: 'Mohammed', middleName: 'Al-Rashid', lastName: 'Al-Qahtani', name: 'Mohammed Al-Rashid Al-Qahtani', jobNumber: '1002', jobTitle: 'Head Nurse', fileNo: '1002', rankGrade: 'Grade 9', nationality: 'Saudi', jobPostLocation: 'Buraydah', actualWorkPlace: 'Inpatient Wards', specialty: 'Medical-Surgical', maritalStatus: 'Married', salary: 12000, unitId: 21, position: 'HN', contactEmail: 'm.alrashid@aigh.sa', status: 'Active', hireDate: '2022-06-01' },
  { id: 3, firstName: 'Fatima', middleName: '', lastName: 'Zahra', name: 'Fatima Zahra', jobNumber: '2003', jobTitle: 'Charge Nurse', fileNo: '2003', rankGrade: 'Grade 8', nationality: 'Egyptian', jobPostLocation: 'Unaizah', actualWorkPlace: 'NICU', specialty: 'Neonatal', maritalStatus: 'Married', salary: 9500, unitId: 15, position: 'CN', contactEmail: 'fatima.z@aigh.sa', status: 'Active', hireDate: '2023-03-10' },
  { id: 4, firstName: 'John', middleName: 'Michael', lastName: 'Smith', name: 'John Michael Smith', jobNumber: '2004', jobTitle: 'Staff Nurse', fileNo: '2004', rankGrade: 'Grade 7', nationality: 'American', jobPostLocation: 'Buraydah', actualWorkPlace: 'ER Main', specialty: 'Emergency', maritalStatus: 'Single', salary: 9000, unitId: 1, position: 'SN', contactEmail: 'john.smith@aigh.sa', status: 'Active', hireDate: '2024-01-20' },
  { id: 5, firstName: 'Aisha', middleName: 'Khan', lastName: 'Al-Otaibi', name: 'Aisha Khan Al-Otaibi', jobNumber: '3005', jobTitle: 'Nurse Practitioner', fileNo: '3005', rankGrade: 'Grade 10', nationality: 'Pakistani', jobPostLocation: 'Buraydah', actualWorkPlace: 'ICU Main', specialty: 'Critical Care', maritalStatus: 'Married', salary: 14000, unitId: 13, position: 'PRACTITIONER', contactEmail: 'aisha.khan@aigh.sa', status: 'Active', hireDate: '2021-11-05' },
  { id: 6, firstName: 'Omar', middleName: 'Hassan', lastName: 'Al-Dosari', name: 'Omar Hassan Al-Dosari', jobNumber: '3006', jobTitle: 'Staff Nurse', fileNo: '3006', rankGrade: 'Grade 7', nationality: 'Saudi', jobPostLocation: 'Ar Rass', actualWorkPlace: 'Operating Room', specialty: 'Surgical', maritalStatus: 'Single', salary: 8500, unitId: 8, position: 'SN', contactEmail: 'omar.hassan@aigh.sa', status: 'Active', hireDate: '2023-07-12' },
  { id: 7, firstName: 'Layla', middleName: '', lastName: 'Mahmoud', name: 'Layla Mahmoud', jobNumber: '4007', jobTitle: 'Midwife', fileNo: '4007', rankGrade: 'Grade 8', nationality: 'Jordanian', jobPostLocation: 'Buraydah', actualWorkPlace: 'Labor and Delivery', specialty: 'Obstetrics', maritalStatus: 'Married', salary: 10000, unitId: 25, position: 'MW', contactEmail: 'layla.m@aigh.sa', status: 'Active', hireDate: '2022-09-18' },
  { id: 8, firstName: 'David', middleName: '', lastName: 'Lee', name: 'David Lee', jobNumber: '4008', jobTitle: 'Nursing Supervisor', fileNo: '4008', rankGrade: 'Grade 11', nationality: 'British', jobPostLocation: 'Buraydah', actualWorkPlace: 'Nursing Admin', specialty: 'Management', maritalStatus: 'Married', salary: 15000, unitId: 21, position: 'NS', contactEmail: 'david.lee@aigh.sa', status: 'Active', hireDate: '2020-05-22' },
];

export const CONTRACTS_SEED = [
  { id: 1, employeeId: 1, startDate: '2023-01-15', endDate: '2026-01-14', status: 'Active' },
  { id: 2, employeeId: 2, startDate: '2022-06-01', endDate: '2026-05-31', status: 'Active' },
  { id: 3, employeeId: 3, startDate: '2023-03-10', endDate: '2026-03-09', status: 'Active' },
  { id: 4, employeeId: 4, startDate: '2024-01-20', endDate: '2027-01-19', status: 'Active' },
  { id: 5, employeeId: 5, startDate: '2021-11-05', endDate: '2026-11-04', status: 'Active' },
  { id: 6, employeeId: 6, startDate: '2023-07-12', endDate: '2026-07-11', status: 'Active' },
  { id: 7, employeeId: 7, startDate: '2022-09-18', endDate: '2025-12-18', status: 'Active' },
  { id: 8, employeeId: 8, startDate: '2020-05-22', endDate: '2026-05-21', status: 'Active' },
];

export const CREDENTIAL_REQUIREMENTS_SEED = [
  { id: 1, templateId: 5, unitId: 13, position: null, isMandatory: true, policyStatus: 'MANDATORY' },
  { id: 2, templateId: 12, unitId: 13, position: null, isMandatory: true, policyStatus: 'MANDATORY' },
  { id: 3, templateId: 13, unitId: 13, position: null, isMandatory: true, policyStatus: 'MANDATORY' },
  { id: 4, templateId: 2, unitId: 13, position: null, isMandatory: true, policyStatus: 'MANDATORY' },
  { id: 5, templateId: 5, unitId: 21, position: 'SN', isMandatory: true, policyStatus: 'MANDATORY' },
  { id: 6, templateId: 12, unitId: 21, position: null, isMandatory: true, policyStatus: 'MANDATORY' },
];

export const BED_CAPACITY_LOG_SEED = [
  { id: 1, unitId: 13, previousCount: 0, newCount: 79, reason: 'Initial seed from Hospital Master Unit Directory', changedBy: null, changedAt: '2026-01-01T00:00:00Z' },
  { id: 2, unitId: 21, previousCount: 0, newCount: 98, reason: 'Initial seed from Hospital Master Unit Directory', changedBy: null, changedAt: '2026-01-01T00:00:00Z' },
];
