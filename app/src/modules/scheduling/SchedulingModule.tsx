import React, { useMemo, useState } from 'react';
import {
  Card, Button, Space, Typography, Select, Modal, message, Tag, Tooltip, Popconfirm, Segmented, List, Empty, theme,
} from 'antd';
import {
  ScheduleOutlined, ThunderboltOutlined, UploadOutlined, LeftOutlined, RightOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useStore } from '../../lib/store';
import dayjs, { Dayjs } from 'dayjs';
import {
  SHIFT_TYPES, SHIFT_BY_NAME, requiredFor, coverageColor, coveragePct, chipName, boardUnits, type ShiftType,
} from '../../lib/roster';

const { Title, Text } = Typography;

export default function SchedulingModule() {
  const { token } = theme.useToken();
  const {
    shiftAssignments, employees, units, departments, eligibilityStates,
    addShiftAssignment, removeShiftAssignment, publishAssignments,
  } = useStore();

  const [view, setView] = useState<'Week' | 'Month'>('Week');
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const [deptFilter, setDeptFilter] = useState<number | undefined>();
  const [assign, setAssign] = useState<{ open: boolean; unitId: number; shiftName: string; date: string }>({ open: false, unitId: 0, shiftName: 'Morning', date: '' });
  const [pickNurse, setPickNurse] = useState<number | undefined>();

  const bUnits = useMemo(() => {
    let u = boardUnits(units as any);
    if (deptFilter) u = u.filter(x => x.departmentId === deptFilter);
    return u;
  }, [units, deptFilter]);

  // Days in the current window.
  const weekStart = anchor.startOf('week');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);
  const windowDates = useMemo(() => {
    if (view === 'Week') return days.map(d => d.format('YYYY-MM-DD'));
    const start = anchor.startOf('month'), end = anchor.endOf('month');
    const out: string[] = [];
    for (let d = start; d.isBefore(end) || d.isSame(end, 'day'); d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'));
    return out;
  }, [view, days, anchor]);

  // Fast lookup: assignments by unit|shiftName|date.
  const cellMap = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of shiftAssignments) {
      const key = `${a.unitId}|${a.shiftName}|${a.shiftDate}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return m;
  }, [shiftAssignments]);
  const cellOf = (unitId: number, shiftName: string, date: string) => cellMap.get(`${unitId}|${shiftName}|${date}`) ?? [];

  const eligOf = (employeeId: number) => eligibilityStates.find(e => e.employeeId === employeeId)?.status;

  // ── KPIs over the current window ──────────────────────────────────────────
  const kpi = useMemo(() => {
    let required = 0, assigned = 0;
    for (const u of bUnits) for (const s of SHIFT_TYPES) for (const date of windowDates) {
      required += requiredFor(u.bedCount, s.key);
      assigned += cellOf(u.id, s.name, date).length;
    }
    return { required, assigned, gap: Math.max(0, required - assigned), pct: coveragePct(assigned, required) };
  }, [bUnits, windowDates, cellMap]);

  // ── Assign flow ───────────────────────────────────────────────────────────
  const openAssign = (unitId: number, shiftName: string, date: string) => { setPickNurse(undefined); setAssign({ open: true, unitId, shiftName, date }); };
  const confirmAssign = () => {
    if (!pickNurse) { message.error('Select a nurse'); return; }
    const dup = shiftAssignments.some(a => a.employeeId === pickNurse && a.shiftDate === assign.date && a.shiftName === assign.shiftName);
    if (dup) { message.error('Double booking — this nurse already has this shift on this day'); return; }
    const s = SHIFT_BY_NAME[assign.shiftName];
    addShiftAssignment({ employeeId: pickNurse, unitId: assign.unitId, shiftDate: assign.date, shiftName: assign.shiftName as any, startTime: s.start, endTime: s.end, status: 'Draft' });
    const emp = employees.find(e => e.id === pickNurse);
    message.success(`${emp?.name} assigned — Draft (eligibility ${eligOf(pickNurse) ?? 'unknown'})`);
    setAssign(a => ({ ...a, open: false }));
  };

  // ── Auto-generate — fill gaps from eligible staff ─────────────────────────
  const autoGenerate = () => {
    let created = 0; const unresolved: string[] = [];
    const booked = new Set(shiftAssignments.map(a => `${a.employeeId}|${a.shiftDate}|${a.shiftName}`));
    const eligible = (employees as any[]).filter(e => !e.deletedAt && eligOf(e.id) !== 'INELIGIBLE');

    for (const date of windowDates) for (const u of bUnits) for (const s of SHIFT_TYPES) {
      let have = cellOf(u.id, s.name, date).length;
      const need = requiredFor(u.bedCount, s.key);
      if (have >= need) continue;
      const pool = [
        ...eligible.filter(e => e.unitId === u.id),
        ...eligible.filter(e => e.unitId !== u.id),
      ];
      for (const cand of pool) {
        if (have >= need) break;
        const k = `${cand.id}|${date}|${s.name}`;
        if (booked.has(k)) continue;
        addShiftAssignment({ employeeId: cand.id, unitId: u.id, shiftDate: date, shiftName: s.name as any, startTime: s.start, endTime: s.end, status: 'Draft' });
        booked.add(k); have++; created++;
      }
      if (have < need) unresolved.push(`${u.code} · ${s.key} · ${dayjs(date).format('DD MMM')} — short ${need - have}`);
    }
    Modal.info({
      title: `Auto-generate complete — ${created} draft assignments created`,
      width: 560,
      content: unresolved.length
        ? <><Text>{unresolved.length} gaps could not be filled from the eligible pool:</Text><List size="small" style={{ marginTop: 8, maxHeight: 260, overflow: 'auto' }} dataSource={unresolved} renderItem={x => <List.Item><Text style={{ fontSize: 12 }}>{x}</Text></List.Item>} /></>
        : <Text>All coverage gaps in the window were filled.</Text>,
    });
  };

  // ── Publish roster — flip drafts in window to published ───────────────────
  const publishRoster = () => {
    const inWindow = new Set(windowDates);
    const ids = shiftAssignments.filter(a => a.status === 'Draft' && inWindow.has(a.shiftDate) && bUnits.some(u => u.id === a.unitId)).map(a => a.id);
    if (ids.length === 0) { message.warning('No draft assignments to publish in this window'); return; }
    const res = publishAssignments(ids);
    if (res.failed.length) {
      Modal.warning({ title: `Published ${res.success}, blocked ${res.failed.length}`, width: 600, content: <List size="small" dataSource={res.failed} renderItem={f => <List.Item><Text style={{ fontSize: 12 }}>#{f.id}: {f.reason}</Text></List.Item>} /> });
    } else {
      message.success(`Published ${res.success} assignments — canonical eligibility re-validated in transaction`);
    }
  };

  const step = (dir: 1 | -1) => setAnchor(a => a.add(dir, view === 'Week' ? 'week' : 'month'));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}><ScheduleOutlined /> Roster &amp; Scheduling</Title>
          <Text type="secondary">Build compliant rosters with fatigue, leave and coverage rules enforced</Text>
        </div>
        <Space wrap>
          <Segmented value={view} onChange={v => setView(v as any)} options={['Week', 'Month']} />
          <Button.Group>
            <Button icon={<LeftOutlined />} onClick={() => step(-1)} />
            <Button onClick={() => setAnchor(dayjs())}>Today</Button>
            <Button icon={<RightOutlined />} onClick={() => step(1)} />
          </Button.Group>
          <Select allowClear placeholder="Department" style={{ width: 180 }} value={deptFilter} onChange={setDeptFilter}
            options={departments.filter((d: any) => d.isActive).map((d: any) => ({ label: `${d.code} — ${d.name}`, value: d.id }))} />
          <Button type="primary" icon={<ThunderboltOutlined />} style={{ background: '#1a6b4e', borderColor: '#1a6b4e' }} onClick={autoGenerate}>Auto-generate</Button>
          <Button icon={<UploadOutlined />} onClick={publishRoster}>Publish roster</Button>
        </Space>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Coverage" value={`${kpi.pct}%`} color={coverageColor(kpi.assigned, kpi.required)} />
        <KpiCard label="Required" value={kpi.required} />
        <KpiCard label="Assigned" value={kpi.assigned} color="#1a6b4e" />
        <KpiCard label="Gap" value={kpi.gap} color={kpi.gap > 0 ? '#dc2626' : '#1a6b4e'} />
      </div>

      {bUnits.length === 0
        ? <Card><Empty description="No units with beds in this department" /></Card>
        : view === 'Week'
          ? <WeekBoard bUnits={bUnits} days={days} cellOf={cellOf} employees={employees} eligOf={eligOf} onAdd={openAssign} onRemove={removeShiftAssignment} />
          : <MonthCalendar anchor={anchor} bUnits={bUnits} cellOf={cellOf} onPickDay={(d) => { setAnchor(d); setView('Week'); }} />}

      {/* Assign modal */}
      <Modal
        title={<>Assign nurse — {units.find((u: any) => u.id === assign.unitId)?.code} · {assign.shiftName} · {dayjs(assign.date).format('ddd DD MMM')}</>}
        open={assign.open} onCancel={() => setAssign(a => ({ ...a, open: false }))} onOk={confirmAssign} okText="Assign (Draft)" destroyOnClose
      >
        <Text type="secondary" style={{ fontSize: 12 }}>Eligibility is shown live. INELIGIBLE nurses are blocked at publish unless a waiver exists.</Text>
        <Select
          showSearch style={{ width: '100%', marginTop: 12 }} placeholder="Search nurse by name or job number" value={pickNurse} onChange={setPickNurse}
          filterOption={(input, opt) => String(opt?.label).toLowerCase().includes(input.toLowerCase())}
          options={(employees as any[]).filter(e => !e.deletedAt).map(e => {
            const st = eligOf(e.id);
            const sameUnit = e.unitId === assign.unitId;
            return { value: e.id, label: `${e.name} (${e.jobNumber}) · ${e.position}${sameUnit ? ' · own unit' : ''} · ${st ?? 'unknown'}` };
          })}
        />
        {pickNurse && (
          <div style={{ marginTop: 12 }}>
            <Tag color={eligOf(pickNurse) === 'ELIGIBLE' ? 'green' : eligOf(pickNurse) === 'ELIGIBLE_WITH_GRACE' ? 'orange' : 'red'}>
              {eligOf(pickNurse) ?? 'UNKNOWN'}
            </Tag>
          </div>
        )}
      </Modal>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-1, #f0f4f8)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--text, #1e293b)', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

// ── Week board ──────────────────────────────────────────────────────────────
function WeekBoard({ bUnits, days, cellOf, employees, eligOf, onAdd, onRemove }: any) {
  const cols = `160px 46px repeat(7, minmax(120px, 1fr))`;
  return (
    <Card styles={{ body: { padding: 0, overflowX: 'auto' } }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap' }}>
        <Text strong style={{ fontSize: 13 }}>{days[0].format('YYYY-MM-DD')} → {days[6].format('YYYY-MM-DD')}</Text>
        {SHIFT_TYPES.map(s => <span key={s.key} style={{ fontSize: 11, color: '#fff', background: s.color, borderRadius: 5, padding: '2px 8px' }}>{s.label}</span>)}
      </div>

      <div style={{ minWidth: 980 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--brand-lt, #e8f5ef)' }}>
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2, #64748b)' }}>Unit / Shift</div>
          <div />
          {days.map((d: Dayjs) => (
            <div key={d.format('DD')} style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>{d.format('ddd')}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.format('DD')}</div>
            </div>
          ))}
        </div>

        {/* Unit blocks */}
        {bUnits.map((u: any) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '2px solid var(--border, #e2e8f0)' }}>
            <div style={{ gridRow: 'span 3', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--border, #e2e8f0)' }}>
              <Text strong style={{ fontSize: 13 }}>{u.code}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{u.name}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{u.bedCount} beds</Text>
            </div>
            {SHIFT_TYPES.map((s: ShiftType) => (
              <React.Fragment key={s.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: s.key !== 'M' ? '1px solid var(--border,#e2e8f0)' : 'none' }}>
                  <span style={{ fontSize: 10, color: '#fff', background: s.color, borderRadius: 4, padding: '1px 6px' }}>{s.key}</span>
                </div>
                {days.map((d: Dayjs) => {
                  const date = d.format('YYYY-MM-DD');
                  const list = cellOf(u.id, s.name, date);
                  const need = requiredFor(u.bedCount, s.key);
                  return (
                    <div key={date} style={{ borderLeft: '1px solid var(--border,#e2e8f0)', borderTop: s.key !== 'M' ? '1px solid var(--border,#e2e8f0)' : 'none', padding: 6, minHeight: 62 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: coverageColor(list.length, need) }}>{list.length}/{need}</span>
                      </div>
                      {list.map((a: any) => {
                        const emp = employees.find((e: any) => e.id === a.employeeId);
                        const st = eligOf(a.employeeId);
                        return (
                          <Popconfirm key={a.id} title="Remove this assignment?" onConfirm={() => onRemove(a.id)} okText="Remove" cancelText="Cancel">
                            <div title={`${emp?.name} · ${st ?? ''} · ${a.status}`} style={{
                              background: a.status === 'Published' ? '#d9f0e6' : '#eef2f7',
                              border: st === 'INELIGIBLE' ? '1px solid #dc2626' : st === 'ELIGIBLE_WITH_GRACE' ? '1px solid #ba7517' : '1px solid transparent',
                              borderRadius: 4, padding: '2px 6px', marginBottom: 3, fontSize: 11, cursor: 'pointer',
                              display: 'flex', justifyContent: 'space-between', gap: 4, alignItems: 'center',
                            }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp ? chipName(emp.name) : a.employeeId}</span>
                              <DeleteOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                            </div>
                          </Popconfirm>
                        );
                      })}
                      <div onClick={() => onAdd(u.id, s.name, date)} style={{ border: '1px dashed var(--border-strong, #cbd5e1)', borderRadius: 4, padding: '1px 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-2,#64748b)', cursor: 'pointer' }}>
                        <PlusOutlined style={{ fontSize: 10 }} />
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Month calendar (coverage overview) ───────────────────────────────────────
function MonthCalendar({ anchor, bUnits, cellOf, onPickDay }: any) {
  const monthStart = anchor.startOf('month');
  const gridStart = monthStart.startOf('week');
  const weeks: Dayjs[][] = [];
  let d = gridStart;
  for (let w = 0; w < 6; w++) {
    const row: Dayjs[] = [];
    for (let i = 0; i < 7; i++) { row.push(d); d = d.add(1, 'day'); }
    weeks.push(row);
    if (d.isAfter(anchor.endOf('month')) && d.day() === 0) break;
  }

  const dayCoverage = (date: Dayjs) => {
    let required = 0, assigned = 0;
    const ds = date.format('YYYY-MM-DD');
    for (const u of bUnits) for (const s of SHIFT_TYPES) { required += requiredFor(u.bedCount, s.key); assigned += cellOf(u.id, s.name, ds).length; }
    return { required, assigned, pct: coveragePct(assigned, required) };
  };

  return (
    <Card styles={{ body: { padding: 12 } }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}><Text strong>{anchor.format('MMMM YYYY')}</Text> <Text type="secondary">— daily coverage · click a day for its week</Text></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2,#64748b)' }}>{w}</div>)}
        {weeks.flat().map((date) => {
          const inMonth = date.month() === anchor.month();
          const { assigned, required, pct } = dayCoverage(date);
          const color = coverageColor(assigned, required);
          return (
            <div key={date.format('YYYY-MM-DD')} onClick={() => onPickDay(date)} style={{
              borderRadius: 8, padding: 8, minHeight: 64, cursor: 'pointer', opacity: inMonth ? 1 : 0.4,
              border: '1px solid var(--border,#e2e8f0)', borderLeft: `3px solid ${color}`, background: 'var(--surface,#fff)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{date.format('D')}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{pct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text-2,#64748b)' }}>{assigned}/{required}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
