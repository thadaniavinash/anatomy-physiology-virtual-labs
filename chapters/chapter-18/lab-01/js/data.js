/* =====================================================================
   Blood Typing Lab — shared data
   Edit this file to change frequencies, explanations or quiz questions.
   ===================================================================== */
window.BT = (function () {
  const AB = ['A', 'B', 'Rh'];
  const NAME = { A: 'Anti-A', B: 'Anti-B', Rh: 'Anti-Rh' };
  const COLOR = { A: '#2f6fe0', B: '#f2c21b', Rh: '#f6f5ef' };
  const LINE = { A: '#1d4fb0', B: '#a37f00', Rh: '#8b95a1' };

  const TYPES = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'];

  // Percentage of Canadians with each blood type (supplied by instructor)
  const FREQ = { 'O+': 39, 'A+': 36, 'B+': 7.6, 'O-': 7, 'A-': 6, 'B-': 1.4, 'AB+': 2.5, 'AB-': 0.5 };

  // Which antigens are on the red cells of each type
  function antigens(t) {
    const abo = t.replace(/[+-]/, '');
    return { A: abo.includes('A'), B: abo.includes('B'), Rh: t.endsWith('+') };
  }
  const REACT = {};
  TYPES.forEach(t => { REACT[t] = antigens(t); });

  // Red cell compatibility: donor cells must carry no antigen the recipient lacks
  function rbcCompatible(recipient, donor) {
    const r = antigens(recipient), d = antigens(donor);
    return (!d.A || r.A) && (!d.B || r.B) && (!d.Rh || r.Rh);
  }
  // Plasma compatibility (ABO only — Rh is not a factor in plasma transfusion):
  // donor plasma must not contain antibodies against the recipient's ABO antigens
  function plasmaCompatible(recipientABO, donorABO) {
    const r = antigens(recipientABO + '+'), d = antigens(donorABO + '+');
    return (!r.A || d.A) && (!r.B || d.B);
  }

  const EXPLAIN = {
    'A+': 'The agglutination caused by the addition of the Anti-A antibody means that the A antigen is present on the surface of the RBC. The lack of agglutination caused by the addition of the Anti-B antibody means that there is no B antigen present. Finally, the agglutination that occurs with the addition of the Anti-Rh antibody means that the Rh antigen is present on the surface of the RBC. Hence, the blood type is A+.',
    'A-': 'The agglutination caused by the addition of the Anti-A antibody means that the A antigen is present on the surface of the RBC. The lack of agglutination caused by the addition of the Anti-B antibody means that there is no B antigen present. Finally, the lack of agglutination with the addition of the Anti-Rh antibody means that the Rh antigen is absent from the surface of the RBC. Hence, the blood type is A−.',
    'B+': 'The lack of agglutination caused by the addition of the Anti-A antibody means that the A antigen is not present on the surface of the RBC. The agglutination caused by the addition of the Anti-B antibody means that the B antigen is present. Finally, the agglutination that occurs with the addition of the Anti-Rh antibody means that the Rh antigen is present on the surface of the RBC. Hence, the blood type is B+.',
    'B-': 'The lack of agglutination caused by the addition of the Anti-A antibody means that the A antigen is not present on the surface of the RBC. The agglutination caused by the addition of the Anti-B antibody means that the B antigen is present. Finally, the lack of agglutination with the addition of the Anti-Rh antibody means that the Rh antigen is absent from the surface of the RBC. Hence, the blood type is B−.',
    'AB+': 'The agglutination caused by the addition of the Anti-A antibody means that the A antigen is present on the surface of the RBC. The agglutination caused by the addition of the Anti-B antibody means that the B antigen is also present on the surface of the RBC. Finally, the agglutination that occurs with the addition of the Anti-Rh antibody means that the Rh antigen is present on the surface of the RBC. Hence, the blood type is AB+.',
    'AB-': 'The agglutination caused by the addition of the Anti-A antibody means that the A antigen is present on the surface of the RBC. The agglutination caused by the addition of the Anti-B antibody means that the B antigen is also present on the surface of the RBC. Finally, the lack of agglutination with the addition of the Anti-Rh antibody means that the Rh antigen is absent from the surface of the RBC. Hence, the blood type is AB−.',
    'O+': 'The lack of agglutination caused by the addition of the Anti-A antibody means that the A antigen is not present on the surface of the RBC. The lack of agglutination caused by the addition of the Anti-B antibody means that the B antigen is not present either. Finally, the agglutination that occurs with the addition of the Anti-Rh antibody means that the Rh antigen is present on the surface of the RBC. Hence, the blood type is O+.',
    'O-': 'The lack of agglutination caused by the addition of the Anti-A antibody means that the A antigen is not present on the surface of the RBC. The lack of agglutination caused by the addition of the Anti-B antibody means that the B antigen is not present either. Finally, the lack of agglutination with the addition of the Anti-Rh antibody means that the Rh antigen is also absent from the surface of the RBC. Hence, the blood type is O−.'
  };

  const nice = t => t.replace('-', '−');

  /* ---------------- QUIZ BANK ----------------
     type: 'single' (answer = index) or 'sata' (select all that apply; answer = array of indices)
     topic: 'antigens' | 'transfusion' | 'plasma'
     Slide-reading questions are generated automatically in quiz.js. */
  const QUIZ = [
    // ---- Antigens & antibodies ----
    { topic: 'antigens', type: 'single',
      q: 'Which antigens are present on the red blood cells of a person with type AB− blood?',
      options: ['A and B antigens only', 'A, B and Rh (D) antigens', 'No ABO antigens, but the Rh (D) antigen', 'Anti-A and anti-B antibodies'],
      answer: 0,
      why: 'AB means both the A and B antigens are on the red cell surface. "Negative" means the Rh (D) antigen is absent. Anti-A and anti-B are antibodies, not antigens, and a type AB person has neither in their plasma.' },
    { topic: 'antigens', type: 'single',
      q: 'A client with type B blood has never received a transfusion. Which antibody is expected in their plasma?',
      options: ['Anti-A', 'Anti-B', 'Anti-A and anti-B', 'Anti-D (anti-Rh)'],
      answer: 0,
      why: 'ABO antibodies form naturally in early infancy against whichever A or B antigen the person lacks. A type B person lacks the A antigen, so they have anti-A. Anti-D is not naturally occurring.' },
    { topic: 'antigens', type: 'single',
      q: 'Why does giving ABO-incompatible red cells cause such a severe reaction?',
      options: [
        'Pre-formed IgM anti-A/anti-B antibodies bind the donor cells, activate complement and destroy them inside the blood vessels',
        'The donor cells carry bacteria that cause sepsis',
        'The recipient must first be sensitized over 2–3 weeks before any reaction occurs',
        'The extra volume overloads the circulation'],
      answer: 0,
      why: 'ABO antibodies are already present (no prior exposure is needed). They are mostly IgM, which strongly activates complement, causing rapid intravascular hemolysis, the hallmark of an acute hemolytic transfusion reaction.' },
    { topic: 'antigens', type: 'single',
      q: 'An Rh-negative client has never been pregnant or transfused. Which statement about anti-D is correct?',
      options: [
        'They will not normally have anti-D, because it forms only after exposure to Rh-positive red cells',
        'They have naturally occurring anti-D from infancy, like anti-A and anti-B',
        'They have anti-D only if they are also type O',
        'Anti-D is present in all Rh-positive people'],
      answer: 0,
      why: 'Unlike ABO antibodies, anti-D is not naturally occurring. An Rh-negative person makes it only after exposure to the D antigen, through transfusion or pregnancy with an Rh-positive fetus.' },
    { topic: 'antigens', type: 'single',
      q: 'What is the purpose of giving Rh immune globulin (RhIG) to an Rh-negative pregnant client?',
      options: [
        'To prevent the client from forming anti-D that could harm a current or future Rh-positive fetus',
        'To change the client’s blood type to Rh positive',
        'To treat an existing hemolytic transfusion reaction',
        'To provide clotting factors before delivery'],
      answer: 0,
      why: 'RhIG clears fetal Rh-positive cells from the mother’s circulation before her immune system responds, preventing anti-D formation and hemolytic disease of the fetus and newborn.' },
    { topic: 'antigens', type: 'sata',
      q: 'A client is type A+. From which donor types can they safely receive red blood cells? Select all that apply.',
      options: ['A+', 'A−', 'O+', 'O−', 'B+', 'AB+'],
      answer: [0, 1, 2, 3],
      why: 'Donor red cells must not carry an antigen the recipient lacks. An A+ client lacks the B antigen, so B and AB cells are excluded. Being Rh positive, they can receive Rh-positive or Rh-negative cells.' },
    { topic: 'antigens', type: 'single',
      q: 'Which blood type is called the "universal donor" for red blood cells?',
      options: ['O−', 'AB+', 'O+', 'AB−'],
      answer: 0,
      why: 'O− red cells carry no A, B or D antigens, so the recipient’s antibodies have nothing to attack. That is why O− is used in emergencies before the client’s type is known.' },

    // ---- Blood transfusion ----
    { topic: 'transfusion', type: 'single',
      q: 'Which IV solution may be used to prime the line and run with a red blood cell transfusion?',
      options: ['0.9% sodium chloride', 'Dextrose 5% in water', 'Lactated Ringer’s', 'Any solution, if the line is flushed first'],
      answer: 0,
      why: 'Only 0.9% sodium chloride is compatible with red cells. Dextrose can cause red cells to clump and hemolyze. Calcium-containing solutions such as Ringer’s can trigger clotting in the citrated blood.' },
    { topic: 'transfusion', type: 'single',
      q: 'A unit of red blood cells must be completely transfused within what time limit?',
      options: ['4 hours of leaving controlled storage', '8 hours', '1 hour', '24 hours'],
      answer: 0,
      why: 'Red cells must be transfused within 4 hours of leaving controlled storage to limit the risk of bacterial growth. If a slower rate is needed, the blood bank can split the unit.' },
    { topic: 'transfusion', type: 'single',
      q: 'Why does the nurse stay with the client and run the transfusion slowly for the first 15 minutes?',
      options: [
        'The most severe reactions, such as acute hemolytic reactions and anaphylaxis, usually appear early and after only a small volume',
        'It takes 15 minutes for the blood to reach body temperature',
        'The filter needs 15 minutes to prime',
        'Hospital policy requires it, but there is no clinical reason'],
      answer: 0,
      why: 'Life-threatening reactions often begin within minutes. A slow start limits how much incompatible or contaminated product the client receives before signs are recognized.' },
    { topic: 'transfusion', type: 'single',
      q: 'Ten minutes into a red cell transfusion, the client reports chills and low back pain. T 38.9°C, BP 86/50, HR 124. What is the nurse’s FIRST action?',
      options: [
        'Stop the transfusion and keep the IV open with 0.9% sodium chloride through new tubing',
        'Slow the transfusion rate and recheck vital signs in 15 minutes',
        'Give acetaminophen and continue the transfusion',
        'Call the blood bank to request another unit'],
      answer: 0,
      why: 'These signs suggest an acute hemolytic reaction. Stopping the transfusion immediately limits the dose of incompatible blood. New tubing keeps venous access without pushing more blood from the old line.' },
    { topic: 'transfusion', type: 'single',
      q: 'An 82-year-old client with heart failure develops dyspnea, crackles, BP 178/96 and distended neck veins during a second unit of red cells. Which reaction is most likely?',
      options: ['Transfusion-associated circulatory overload (TACO)', 'Transfusion-related acute lung injury (TRALI)', 'Febrile non-hemolytic reaction', 'Minor allergic reaction'],
      answer: 0,
      why: 'Respiratory distress with hypertension and signs of fluid overload in a high-risk client points to TACO. TRALI also causes respiratory distress but usually with hypotension and no fluid overload.' },
    { topic: 'transfusion', type: 'sata',
      q: 'Which actions are required before starting a red blood cell transfusion? Select all that apply.',
      options: [
        'Confirm that informed consent has been obtained and documented',
        'Verify the client’s identity using two identifiers at the bedside with a second qualified person',
        'Take baseline vital signs within 30 minutes before starting',
        'Inspect the bag for clots, discolouration or leaks',
        'Add the client’s scheduled IV antibiotic to the blood line',
        'Warm the unit in a microwave to body temperature'],
      answer: [0, 1, 2, 3],
      why: 'Consent, a two-person bedside identity check, baseline vitals and inspection of the product are standard safety checks. Medications are never added to blood, and blood is only warmed with an approved blood warmer.' },
    { topic: 'transfusion', type: 'single',
      q: 'A client who received red cells 7 days ago now has jaundice, fever and a falling hemoglobin. Which reaction is most likely?',
      options: ['Delayed hemolytic transfusion reaction', 'Acute hemolytic transfusion reaction', 'Anaphylaxis', 'TACO'],
      answer: 0,
      why: 'Delayed hemolytic reactions typically occur 3–14 days after transfusion, when a re-stimulated antibody (from a prior transfusion or pregnancy) slowly destroys the donor cells.' },
    { topic: 'transfusion', type: 'single',
      q: 'During a transfusion, a client develops a few itchy hives on the chest. Vital signs are stable and there is no difficulty breathing. What is the best initial action?',
      options: [
        'Stop the transfusion, assess the client and notify the prescriber; it may be restarted slowly only if ordered',
        'Continue at the same rate; hives are expected',
        'Discontinue the IV and remove the catheter',
        'Increase the rate to finish the unit quickly'],
      answer: 0,
      why: 'Any suspected reaction means stopping and assessing first. For isolated mild hives, the prescriber may order an antihistamine and allow the same unit to be restarted slowly. Progression to wheeze, swelling or hypotension suggests anaphylaxis.' },

    // ---- Plasma transfusion ----
    { topic: 'plasma', type: 'single',
      q: 'Which ABO group is the "universal donor" for plasma?',
      options: ['AB', 'O', 'A', 'B'],
      answer: 0,
      why: 'Group AB plasma contains neither anti-A nor anti-B, so it will not attack any recipient’s red cells. This is the reverse of red cell transfusion, where O is the universal donor.' },
    { topic: 'plasma', type: 'sata',
      q: 'A client is group A. Which plasma groups are compatible? Select all that apply.',
      options: ['A', 'AB', 'O', 'B'],
      answer: [0, 1],
      why: 'The client’s red cells carry the A antigen, so the donor plasma must not contain anti-A. Group O and group B plasma both contain anti-A. Groups A and AB do not.' },
    { topic: 'plasma', type: 'single',
      q: 'Which statement about Rh and plasma transfusion is correct?',
      options: [
        'Rh is not a factor when selecting plasma',
        'Rh-negative clients must receive Rh-negative plasma',
        'Plasma must be both ABO-identical and Rh-identical',
        'Rh-positive plasma causes agglutination in Rh-negative clients'],
      answer: 0,
      why: 'Plasma contains essentially no red cells, so the Rh (D) antigen is not a concern. Only ABO compatibility is required.' },
    { topic: 'plasma', type: 'single',
      q: 'For which client is a frozen plasma transfusion most appropriate?',
      options: [
        'A client with liver disease who is actively bleeding and has deficiencies in several clotting factors',
        'A client who needs fluid volume replacement after vomiting',
        'A stable client with an INR of 1.4 before a minor procedure',
        'A client taking warfarin who needs urgent reversal, when prothrombin complex concentrate is available'],
      answer: 0,
      why: 'Plasma is indicated for bleeding with multiple coagulation factor deficiencies. It is not used for volume replacement or a mildly raised INR. In Canada, urgent warfarin reversal uses prothrombin complex concentrate (PCC) plus vitamin K.' },
    { topic: 'plasma', type: 'single',
      q: 'Plasma-rich products such as frozen plasma are most often linked to which serious adverse event?',
      options: ['Transfusion-related acute lung injury (TRALI)', 'Iron overload', 'Delayed hemolytic reaction', 'Hyperkalemia'],
      answer: 0,
      why: 'TRALI is usually caused by antibodies in the donor plasma that react with the recipient’s white cells in the lungs. Plasma-rich products carry the highest risk. Large plasma volumes also increase the risk of TACO.' },
    { topic: 'plasma', type: 'single',
      q: 'Why should the nurse notify the blood bank early when frozen plasma is ordered?',
      options: [
        'It must be thawed first, which takes at least 20–30 minutes',
        'It must be crossmatched, which takes several hours',
        'It must be irradiated before every transfusion',
        'It can only be issued after the client’s Rh type is confirmed twice'],
      answer: 0,
      why: 'Plasma is stored frozen and must be thawed before issue (at least 20 minutes for frozen plasma, 30 minutes for solvent/detergent plasma). It is ABO-group matched, not crossmatched.' }
  ];

  return { AB, NAME, COLOR, LINE, TYPES, FREQ, REACT, antigens, rbcCompatible, plasmaCompatible, EXPLAIN, QUIZ, nice };
})();
