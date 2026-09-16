# Spec: Employee Onboarding (Add Employee)

**System under test:** OrangeHRM Community, observed on the official public
demo (`opensource-demo.orangehrmlive.com`, OrangeHRM OS 5.9), logged in as
`Admin`. Screen: PIM → Add Employee
(`/web/index.php/pim/addEmployee`).

## Observed behavior

### Base form (login details collapsed)
The Add Employee form shows, by default:
- **Employee Full Name**: First Name, Middle Name, Last Name — three separate
  text inputs under one "Employee Full Name*" label.
- **Employee Id**: pre-filled by the system with an auto-generated numeric
  value (observed: `0458`), left editable as free text.
- A photo upload control ("Accepts jpg, .png, .gif up to 1MB. Recommended
  dimensions: 200px X 200px"), optional.
- A **Create Login Details** toggle, off by default.
- Cancel / Save buttons.

### Required-field validation (login details off)
Clicking **Save** with all fields empty produces inline "Required" errors
under **First Name** and **Last Name** only. **Middle Name** and
**Employee Id** are never required. No request is sent to the server for
this state — validation is client-side and immediate.

### Create Login Details (toggled on)
Turning on **Create Login Details** reveals, in addition to the name fields:
- **Username*** (text)
- **Status**: radio group, `Enabled` / `Disabled`, defaulting to **Enabled**.
- **Password***, with live strength meter and helper text: *"For a strong
  password, please use a hard to guess combination of text with upper and
  lower case characters, symbols and numbers."*
- **Confirm Password***

### Login-detail validation (observed via Save with bad input)
Submitting with Username = an existing username (`Admin`), Password = `abc`,
Confirm Password = `xyz` returned, simultaneously, in one round trip:
- Username field: **"Username already exists"**
- Password field: strength badge **"Very Weak"**, error **"Should have at
  least 7 characters"**
- Confirm Password field: **"Passwords do not match"**

This confirms: username uniqueness is enforced server-side (not just format),
minimum password length is 7 characters, there is a live strength indicator
with at least the labels "Very Weak" and "Strong" observed, and
password/confirm-password equality is checked independently of strength.

### Successful creation
Submitting First Name = `QA`, Last Name = `Tester`, Username =
`qatester_day1`, Password/Confirm = a 13-character mixed-case value with a
symbol and digits → strength badge showed **"Strong"**, all field errors
cleared, and the save succeeded ("Successfully Saved" toast).

On success the app **redirects from the Add Employee form to the new
employee's full Personal Details page**
(`/web/index.php/pim/viewPersonalDetails/empNumber/{n}`), which exposes many
additional **optional** fields not present on the Add Employee screen: Other
Id, Driver's License Number, License Expiry Date, Nationality, Marital
Status, Date of Birth, Gender, plus separate tabs for Contact Details,
Emergency Contacts, Dependents, Immigration, Job, Salary, Report-to,
Qualifications, etc. None of these are required to complete onboarding — only
First Name + Last Name (and, if login is created, Username + Password) gate
the initial save.

The Employee Id entered at creation time (`0458`) was carried through
unchanged to the Personal Details page — it is stored as typed, not
re-validated for uniqueness by the observed flow.

## Acceptance criteria

1. **AC-1**: Given the Add Employee form, when First Name and Last Name are
   both empty and Save is clicked, then inline "Required" errors appear under
   both fields and no employee is created.
2. **AC-2**: Given the Add Employee form, when only Middle Name and/or
   Employee Id are left empty, then Save succeeds (these fields are optional).
3. **AC-3**: Given Create Login Details is enabled, when Username matches an
   existing user's username, then Save fails with an inline "Username already
   exists" error and no employee/login is created.
4. **AC-4**: Given Create Login Details is enabled, when Password is fewer
   than 7 characters, then Save fails with an inline "Should have at least 7
   characters" error and a "Very Weak"-or-lower strength indicator.
5. **AC-5**: Given Create Login Details is enabled, when Password and Confirm
   Password differ, then Save fails with an inline "Passwords do not match"
   error, independent of whether the password itself is strong.
6. **AC-6**: Given valid First Name, Last Name, a unique Username, and
   matching strong Password/Confirm Password, then Save succeeds, a
   "Successfully Saved" confirmation is shown, and the user is redirected to
   that employee's Personal Details page with the entered name and Employee
   Id preserved.
7. **AC-7**: Given Create Login Details is left off, then Save can succeed
   with only First Name + Last Name populated and no login account is
   created for the employee.
8. **AC-8**: Given a successfully created employee, then all Personal Details
   fields beyond Employee Full Name (Nationality, Marital Status, Date of
   Birth, Gender, Other Id, license fields, etc.) are optional and are not
   enforced at onboarding time.

## Edge cases

- **Empty required fields**: First Name and/or Last Name blank → blocked
  client-side, no server round trip (AC-1).
- **Duplicate username**: reusing an existing login username (`Admin`) is
  rejected server-side, not just checked for emptiness (AC-3).
- **Weak/short password boundary**: exactly at or under 7 characters is
  flagged; the strength meter (Very Weak → Strong) is a separate signal from
  the hard length-7 minimum — a password can be long enough to pass the
  length check yet still be labeled weak.
- **Password mismatch**: reported independently and simultaneously alongside
  username and password-strength errors, i.e., the form does not stop at the
  first invalid field — all invalid fields are reported together in one
  submit.
- **Non-unique Employee Id**: the free-text Employee Id field is not
  re-validated for uniqueness by the UI at creation time — two employees
  could plausibly end up with the same Employee Id (only Username, when a
  login is created, is enforced unique).
- **Toggling Create Login Details off after entering data**: not exercised in
  this pass — flagged as a follow-up check (does previously entered
  username/password data get discarded or silently retained?).
- **Photo upload boundary (1MB / dimension limits)**: stated in the UI copy
  but not exercised in this pass — flagged as a follow-up (file-size/type
  rejection behavior unverified).
