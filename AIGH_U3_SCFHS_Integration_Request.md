# U3 — SCFHS Integration Request Pack
### AIGH Nursing Workforce Management System

**Purpose:** obtain an SCFHS electronic-verification integration agreement before the Phase 3 pilot.
**Owner:** Medical Director · **Escalation:** Hospital General Director
**Deadline:** **submit by Week 2** — agreements typically take 4–12 weeks; the Phase 3 gate needs nightly sync running against 10+ practitioner records.
**Status:** prepared 18 September 2026 · specification rev 2.8.7c

> **Nothing is waiting on this.** The integration service scaffold and the resilience layer (circuit breaker, sync-state tracking, stale/failed/pending status) can be built now against mock responses. When the agreement and certificates arrive, integration becomes a configuration change rather than a development sprint.

---

## 1. What must be requested

| # | Item | Detail |
| :--- | :--- | :--- |
| 1 | **API access** | Credentials and endpoint for the electronic verification service; published rate limits |
| 2 | **Sandbox / staging environment** | Access for validation before production traffic |
| 3 | **mTLS client certificate** | Issuance for mutual TLS; renewal procedure; revocation handling |
| 4 | **Field mapping and response schema** | Which SCFHS fields map to our credential fields; handling of Arabic↔English name transliteration |
| 5 | **Permitted sync frequency** | How often the nightly bulk verification may query without triggering rate limits or IP blocking |
| 6 | **Policy decisions** | (a) Does the hospital accept automatic eligibility suspension on a `REVOKED`/`SUSPENDED` response, or is manual HR review required first? (b) When SCFHS is unreachable, is a 48-hour stale-eligibility window acceptable? |

---

## 2. Draft request letter — Arabic

> **الموضوع: طلب الحصول على صلاحية الوصول إلى خدمة التحقق الإلكتروني من التراخيص المهنية**
>
> سعادة الأمين العام للهيئة السعودية للتخصصات الصحية المحترم
>
> السلام عليكم ورحمة الله وبركاته،
>
> إشارةً إلى جهود الهيئة في تنظيم المهن الصحية والتحقق من التراخيص، نتقدم إليكم بطلب الحصول على صلاحية الوصول إلى واجهة برمجة التطبيقات (API) الخاصة بخدمة التحقق الإلكتروني، وذلك لتمكين مستشفى ________ من التحقق الآلي من تراخيص التسجيل المهني للكوادر التمريضية.
>
> ويهدف هذا الطلب إلى:
> - التحقق الآلي من سريان التراخيص المهنية وصلاحيتها، ودقة التصنيف المهني.
> - الكشف المبكر عن أي تغيير في حالة الترخيص (إيقاف أو إلغاء) بين دورات التجديد.
> - تقليل الاعتماد على التحقق اليدوي وتقليل احتمال الخطأ البشري.
>
> **نطاق التطبيق:** التحقق من تراخيص الكوادر التمريضية في المستشفى. المرحلة التجريبية الأولى: ٥٠ ممارسًا في وحدة واحدة، على أن يتوسع النطاق تدريجيًا ليشمل كامل القوى العاملة التمريضية.
>
> **المتطلبات الفنية المطلوبة:**
> 1. بيانات الوصول إلى واجهة برمجة التطبيقات (بيئة الاختبار وبيئة الإنتاج) وحدود الاستخدام المعتمدة.
> 2. شهادة العميل اللازمة للمصادقة المتبادلة (mTLS) وآلية تجديدها.
> 3. دليل الحقول ومخطط الاستجابة المعتمد، بما يشمل آلية التعامل مع نقل الأسماء بين العربية والإنجليزية.
> 4. التكرار المسموح به للمزامنة الدورية (مزامنة ليلية للتحقق من قائمة الكوادر).
>
> ونقترح تحديد جهة اتصال فنية من الطرفين لمتابعة الطلب وإتمام الإجراءات. ونؤكد استعداد المستشفى لتوفير ما يلزم من ضمانات لحماية البيانات وفقًا لنظام حماية البيانات الشخصية ولائحته التنفيذية.
>
> وتفضلوا بقبول فائق الاحترام والتقدير.
>
> **المدير الطبي:** ____________________  **التوقيع:** ____________  **التاريخ:** ____________
> **مستشفى:** ____________________  **جهة الاتصال الفنية:** ____________________  **الهاتف/البريد:** ____________

*ملاحظة: هذه مسودة — يُرجى مراجعتها من مكتب المراسلات الرسمية قبل الإرسال.*

---

## 3. Draft request letter — English

> **Subject: Request for access to the SCFHS electronic license-verification service**
>
> Dear Secretary General,
>
> We request access to the SCFHS electronic verification API to enable automated validation of professional registration licenses for the nursing workforce at ____________ Hospital.
>
> **Objectives:** automated confirmation of license validity and professional classification; early detection of status changes (suspension or revocation) between renewal cycles; reduction of manual verification workload and associated human error.
>
> **Scope:** verification of nursing staff licenses. Initial pilot: 50 practitioners in one unit, scaling to the full nursing workforce.
>
> **Technical requirements:**
> 1. API credentials for sandbox and production, with published rate limits.
> 2. Client certificate issuance for mutual TLS (mTLS), including renewal procedure.
> 3. Field-mapping guide and response schema, including Arabic↔English name transliteration handling.
> 4. Permitted frequency for the scheduled nightly verification sync.
>
> We propose naming a technical liaison on each side to track this request. The hospital will implement the data-protection safeguards required under the Personal Data Protection Law and its implementing regulations.
>
> Yours faithfully,
> **Medical Director:** ____________________  **Signature:** ____________  **Date:** ____________

---

## 4. Technical annex for the SCFHS IT contact

| Item | Our position |
| :--- | :--- |
| Calling system | AIGH Nursing Workforce Management System (NurseApp) |
| Authentication | mTLS with a client certificate issued to the hospital |
| Integration pattern | Read-only verification; we never write to SCFHS records |
| Sync model | Scheduled nightly bulk verification of active nursing licences, plus event-driven verification at credential submission and renewal approval |
| Request volume (pilot) | ~50 records nightly — one request per practitioner, respecting the agreed rate limit |
| Request volume (full rollout) | Scaled to the nursing workforce; we will confirm against the published rate limit before enabling |
| Data sent | Registration number (primary lookup key); we do not transmit patient data |
| Data stored | Verification result, expiry date, specialty, classification, raw-response hash, and a mismatch flag — see the table below |
| Failure handling | Circuit breaker on repeated failures; last-known-good result retained for up to 48 hours (subject to hospital policy confirmation) |
| Audit | Every verification attempt is logged with request time, response status and actor; logs are retained for audit and never contain patient data |
| Environment requested | Sandbox first, then production |

**What we store from each verification**

| Field | Purpose |
| :--- | :--- |
| Registration number | Identifier |
| Response status | `VERIFIED` / `EXPIRED` / `SUSPENDED` / `REVOKED` / `NOT_FOUND` / `ERROR` |
| Expiry date returned | Drives expiry alerts and eligibility |
| Specialty / classification | Displayed on the credential record |
| Response hash (SHA-256) | Tamper evidence; the full response is not stored in clear |
| Discrepancy notes | Flags where SCFHS data differs from our record, for HR review |

---

## 5. Follow-up cadence

| When | Action | Owner |
| :--- | :--- | :--- |
| Week 2 | Letter submitted; liaison named; reference number recorded | Medical Director |
| Weekly | Status update to the project meeting | Hospital liaison |
| On sandbox access | Validate against 10+ practitioner records | Tech Lead |
| On certificate issuance | Enable nightly sync for the pilot unit | DevOps |
| Phase 3 gate | Nightly sync running without errors; discrepancy handling demonstrated | All |

---

## 6. Policy questions to answer while the agreement is in progress

These are hospital decisions, not SCFHS decisions — resolve them in parallel:

| Question | Recommended | Hospital decision |
| :--- | :--- | :--- |
| On `REVOKED`/`SUSPENDED` from SCFHS: suspend eligibility automatically, or route to HR review first? | Automatic suspend (safety-first), with immediate HR notification | |
| When SCFHS is unreachable: keep nurses eligible on last-known-good for up to 48 hours? | Yes for the pilot; confirm with compliance | |
| Who owns SCFHS certificate renewal? | Named operations owner | |
| Who reviews and resolves discrepancies flagged by the sync? | Named HR reviewer | |

---

*Prepared from §13.4.3 and §5.4 of `AIGH_Nursing_Workforce_Management_System_v2_8_7.md`.*
