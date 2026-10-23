import { criticVerdict, setCriticVerdict } from './critic-verdict';

// The critic's verdict on a draft, read from its own job's pipeline_trace. The qgen crew writes
// it two ways (qgen_crew.py): the set lane adds one `critique` row per call with a count in its
// notes, then a `critique_verdict` row per candidate carrying `accepted` and the critic's notes;
// the single lane's `critique` row carries both itself.
describe('criticVerdict', () => {
  it('reads the set lane’s last critique_verdict row, never the counting critique row', () => {
    const trace = [
      { name: 'generate', status: 'ACCEPTED', attempt: 1 },
      { name: 'critique', status: 'ACCEPTED', attempt: 1, notes: '1 candidate(s), 0 accepted, 1 rejected' },
      { name: 'critique_verdict', status: 'REJECTED', attempt: 1, notes: 'Option D is arguable.', accepted: false, suggested_revisions: ['x'] },
      { name: 'critique', status: 'ACCEPTED', attempt: 2, notes: '1 candidate(s), 1 accepted, 0 rejected' },
      { name: 'critique_verdict', status: 'ACCEPTED', attempt: 2, notes: 'Only one option destroys germs now.', accepted: true, suggested_revisions: [] },
      { name: 'quality_gate', status: 'ACCEPTED' },
    ];
    expect(criticVerdict(trace)).toEqual({ accepted: true, notes: 'Only one option destroys germs now.' });
  });

  it('reads the single lane’s critique row when it carries the verdict', () => {
    const trace = [
      { name: 'critique', status: 'REJECTED', attempt: 1, notes: 'Arguable.', accepted: false },
      { name: 'critique', status: 'ACCEPTED', attempt: 2, notes: '', accepted: true },
    ];
    expect(criticVerdict(trace)).toEqual({ accepted: true, notes: '' });
  });

  it('says the verdict is unknown when no row carries one, never accepted', () => {
    expect(criticVerdict([{ name: 'critique', status: 'ACCEPTED', notes: '1 candidate(s), 1 accepted, 0 rejected' }])).toBeNull();
    expect(criticVerdict([])).toBeNull();
    expect(criticVerdict(undefined)).toBeNull();
  });
});

// A campaign set's verdict, from consumption's served trace (name, status, attempt and accepted
// only; the notes are never served). The set lane re-sends only the candidates the critic
// rejected, so the critic's final word on the set is its LAST call's verdict rows.
describe('setCriticVerdict', () => {
  const sentBackThenAccepted = [
    { name: 'generate', status: 'COMPLETED', attempt: 1 },
    { name: 'critique', status: 'COMPLETED', attempt: 1 },
    { name: 'critique_verdict', status: 'ACCEPTED', attempt: 1, accepted: true },
    { name: 'critique_verdict', status: 'REJECTED', attempt: 1, accepted: false },
    { name: 'quality_gate', status: 'RETRY', attempt: 1 },
    { name: 'regenerate_rejected', status: 'RETRY', attempt: 1 },
    { name: 'generate', status: 'COMPLETED', attempt: 2 },
    { name: 'critique', status: 'COMPLETED', attempt: 2 },
    { name: 'critique_verdict', status: 'ACCEPTED', attempt: 2, accepted: true },
    { name: 'quality_gate', status: 'ACCEPTED', attempt: 2 },
  ];

  it('accepted when every verdict of the last call is, whatever an earlier call said', () => {
    expect(setCriticVerdict(sentBackThenAccepted)).toEqual({ accepted: true });
  });

  it('rejected when any verdict of the last call is, even if its last row accepted', () => {
    const trace = [
      { name: 'critique', status: 'COMPLETED', attempt: 1 },
      { name: 'critique_verdict', status: 'REJECTED', attempt: 1, accepted: false },
      { name: 'critique_verdict', status: 'ACCEPTED', attempt: 1, accepted: true },
      { name: 'quality_gate', status: 'ACCEPTED', attempt: 1 },
    ];
    expect(setCriticVerdict(trace)).toEqual({ accepted: false });
  });

  it('unknown when the last call has no verdict row, or no critic ran', () => {
    expect(setCriticVerdict([...sentBackThenAccepted, { name: 'critique', status: 'FAILED', attempt: 3 }])).toBeNull();
    const noCritic = [{ name: 'generate', status: 'COMPLETED', attempt: 1 }];
    expect(setCriticVerdict(noCritic)).toBeNull();
    expect(setCriticVerdict(null)).toBeNull();
  });

  it('a verdict row without a boolean is not read as either', () => {
    const trace = [
      { name: 'critique', status: 'COMPLETED', attempt: 1 },
      { name: 'critique_verdict', status: 'ACCEPTED', attempt: 1, accepted: null },
    ];
    expect(setCriticVerdict(trace)).toBeNull();
  });
});
