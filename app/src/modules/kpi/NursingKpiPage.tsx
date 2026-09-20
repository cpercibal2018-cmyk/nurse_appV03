import React, { useMemo, useState } from 'react';
import { Card, Row, Col, Typography, Segmented, DatePicker, InputNumber, Space, Tag, Table, Descriptions, Alert, Button, Tooltip, theme } from 'antd';
import { DashboardOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useStore } from '../../lib/store';
import {
  computeKpiA, computeKpiB, rosterCountsByArea, rosterCountsHospital,
  BAND_COLORS, BAND_ORDER, type Band, type CriticalArea, type AreaResult,
} from '../../lib/kpi';

const { Title, Text, Paragraph } = Typography;

// A horizontal 4-band traffic-light meter with a marker at the current band.
function BandMeter({ band, height = 12 }: { band: Band; height?: number }) {
  return (
    <div style={{ display: 'flex', width: '100%', borderRadius: 6, overflow: 'hidden', height }}>
      {BAND_ORDER.map(b => (
        <div key={b} style={{
          flex: 1,
          background: BAND_COLORS[b],
          opacity: b === band ? 1 : 0.28,
          borderTop: b === band ? `2px solid ${BAND_COLORS[b]}` : 'none',
          transition: 'opacity .2s',
        }} />
      ))}
    </div>
  );
}

function BandTag({ band }: { band: Band }) {
  return <Tag color={BAND_COLORS[band]} style={{ color: '#fff', fontWeight: 600, border: 'none' }}>{band}</Tag>;
}

const AREA_LABEL: Record<CriticalArea, string> = { ICU: 'ICU', ER: 'Emergency (ER)', OR: 'Operating Room (OR)' };
const AREA_TARGET: Record<CriticalArea, string> = { ICU: '≥ 1:1', ER: '≥ 1:2', OR: '≥ 2:1' };

export default function NursingKpiPage() {
  const { token } = theme.useToken();
  const { units, shiftAssignments } = useStore();

  const [source, setSource] = useState<'Model' | 'From roster'>('Model');
  const [shiftDate, setShiftDate] = useState(dayjs());
  const [shiftName, setShiftName] = useState<'Morning' | 'Evening' | 'Night'>('Morning');

  // Operational beds per area, derived live from the unit directory.
  const bedsByArea = useMemo(() => {
    const counts = rosterCountsByArea(units as any, [], '', '');
    return { ICU: counts.ICU.beds, ER: counts.ER.beds, OR: counts.OR.beds };
  }, [units]);
  const hospitalBeds = useMemo(() => (units as any[]).filter(u => u.isActive !== false).reduce((s, u) => s + u.bedCount, 0), [units]);

  // Modelled "nurses on duty" — seeded to land in a spread of bands so the
  // traffic-lights are legible on load; fully editable to model scenarios.
  const [modelNurses, setModelNurses] = useState<Record<CriticalArea, number>>({ ICU: 70, ER: 50, OR: 7 });
  const [modelHospitalNurses, setModelHospitalNurses] = useState(85);

  // Live roster counts (published assignments on the chosen date/shift).
  const rosterAreas = useMemo(
    () => rosterCountsByArea(units as any, shiftAssignments as any, shiftDate.format('YYYY-MM-DD'), shiftName),
    [units, shiftAssignments, shiftDate, shiftName],
  );
  const rosterHospital = useMemo(
    () => rosterCountsHospital(units as any, shiftAssignments as any, shiftDate.format('YYYY-MM-DD'), shiftName),
    [units, shiftAssignments, shiftDate, shiftName],
  );

  const kpiAInput = source === 'Model'
    ? { ICU: { nurses: modelNurses.ICU, beds: bedsByArea.ICU }, ER: { nurses: modelNurses.ER, beds: bedsByArea.ER }, OR: { nurses: modelNurses.OR, beds: bedsByArea.OR } }
    : rosterAreas;
  const kpiA = useMemo(() => computeKpiA(kpiAInput), [kpiAInput]);

  const kpiBNurses = source === 'Model' ? modelHospitalNurses : rosterHospital.nurses;
  const kpiB = useMemo(() => computeKpiB(kpiBNurses, hospitalBeds), [kpiBNurses, hospitalBeds]);

  const resetModel = () => { setModelNurses({ ICU: 70, ER: 50, OR: 7 }); setModelHospitalNurses(85); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><DashboardOutlined /> Nursing KPIs — MoH Ada'a Quality Failure Regime</Title>
        <Space wrap>
          <Segmented value={source} onChange={v => setSource(v as any)} options={['Model', 'From roster']} />
          <DatePicker value={shiftDate} onChange={d => d && setShiftDate(d)} allowClear={false} />
          <Segmented value={shiftName} onChange={v => setShiftName(v as any)} options={['Morning', 'Evening', 'Night']} />
          {source === 'Model' && <Tooltip title="Reset modelled staffing to defaults"><Button icon={<ReloadOutlined />} onClick={resetModel} /></Tooltip>}
        </Space>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message={source === 'Model' ? 'Modelling mode — edit “nurses on duty” per area to see the band change' : `From published roster — ${shiftName} shift, ${shiftDate.format('DD MMM YYYY')}`}
        description={source === 'Model'
          ? 'Operational beds are read live from the Hospital Master Unit Directory (47 units / 582 beds). Enter the average nurses on duty to compute each ratio. Owner: Deputyship for Therapeutic Services (MoH) · monthly reporting · data source: Adaa Health Dashboard.'
          : 'Nurses on duty are counted from staff with a Published shift assignment on the selected date/shift. The seeded demo roster is sparse, so switch to Modelling mode for representative ratios.'}
      />

      <Row gutter={[16, 16]}>
        {/* ── KPI A — Critical Areas ─────────────────────────────────────── */}
        <Col xs={24} xl={14}>
          <Card
            title={<Space><span>Nurse to Bed Ratio — Critical Areas</span><BandTag band={kpiA.band} /></Space>}
            extra={<Text type="secondary">Final score {kpiA.averageCode.toFixed(2)} / 4</Text>}
          >
            <Row gutter={[12, 12]}>
              {kpiA.areas.map(area => (
                <Col xs={24} md={8} key={area.area}>
                  <AreaCard area={area} beds={bedsByArea[area.area]}
                    editable={source === 'Model'}
                    nurses={source === 'Model' ? modelNurses[area.area] : area.nurses}
                    onNurses={n => setModelNurses(m => ({ ...m, [area.area]: n }))}
                  />
                </Col>
              ))}
            </Row>
            <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
              <Descriptions.Item label="Method">Each area coded 1–4, then averaged. Bands: 1–1.5 Standard · 1.5–2.5 Distress · 2.5–3.5 Failing · 3.5–4 Failed.</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* ── KPI B — Hospital-Wide (QFR-55) ─────────────────────────────── */}
        <Col xs={24} xl={10}>
          <Card title={<Space><span>Hospital Nurse to Bed Ratio</span><Tag>QFR-55</Tag><BandTag band={kpiB.band} /></Space>}>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <Text type="secondary">Hospital-wide ratio</Text>
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, color: BAND_COLORS[kpiB.band] }}>{kpiB.ratioLabel}</div>
              <Text type="secondary">{kpiB.nurses} nurses on duty · {kpiB.beds} operational beds</Text>
            </div>
            <div style={{ margin: '12px 0' }}><BandMeter band={kpiB.band} height={16} /></div>
            {source === 'Model' && (
              <Space style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                <Text>Nurses on duty (hospital-wide):</Text>
                <InputNumber min={0} max={5000} value={modelHospitalNurses} onChange={v => setModelHospitalNurses(v ?? 0)} />
              </Space>
            )}
            <Table
              size="small" pagination={false} showHeader={false}
              rowKey="band"
              dataSource={[
                { band: 'Standard', label: '1 : <6' },
                { band: 'Distress', label: '1 : 6 – <7' },
                { band: 'Failing', label: '1 : 7 – 9' },
                { band: 'Failed', label: '1 : >9' },
              ]}
              columns={[
                { dataIndex: 'band', render: (b: Band) => <BandTag band={b} /> },
                { dataIndex: 'label', align: 'right' as const, render: (t: string, r: any) => <Text strong={r.band === kpiB.band}>{t}</Text> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Ada'a Indicator Profiles ─────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}><IndicatorProfileA /></Col>
        <Col xs={24} xl={12}><IndicatorProfileB /></Col>
      </Row>
    </div>
  );
}

function AreaCard({ area, beds, nurses, editable, onNurses }: { area: AreaResult; beds: number; nurses: number; editable: boolean; onNurses: (n: number) => void }) {
  return (
    <Card size="small" style={{ borderTop: `3px solid ${BAND_COLORS[area.band]}` }}
      styles={{ body: { padding: 12 } }}>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{AREA_LABEL[area.area]}</Text>
          <BandTag band={area.band} />
        </Space>
        <div style={{ fontSize: 26, fontWeight: 700, color: BAND_COLORS[area.band], lineHeight: 1 }}>{area.ratioLabel}</div>
        <Text type="secondary" style={{ fontSize: 12 }}>Target {AREA_TARGET[area.area]} · code {area.code}/4</Text>
        <BandMeter band={area.band} />
        <Space style={{ justifyContent: 'space-between', width: '100%' }} size={4}>
          {editable
            ? <Space size={4}><Text style={{ fontSize: 12 }}>Nurses</Text><InputNumber size="small" min={0} max={2000} value={nurses} onChange={v => onNurses(v ?? 0)} style={{ width: 72 }} /></Space>
            : <Text style={{ fontSize: 12 }}>{nurses} nurses</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>{beds} beds</Text>
        </Space>
      </Space>
    </Card>
  );
}

function IndicatorProfileA() {
  return (
    <Card title={<Space><InfoCircleOutlined /> Indicator Profile — Nurse to Bed Ratio (Critical Areas)</Space>} size="small">
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="Category">Workforce Management</Descriptions.Item>
        <Descriptions.Item label="Owner">Deputyship for Therapeutic Services (MoH)</Descriptions.Item>
        <Descriptions.Item label="Unit">Ratio</Descriptions.Item>
        <Descriptions.Item label="Polarity">Positive</Descriptions.Item>
        <Descriptions.Item label="Frequency">Monthly</Descriptions.Item>
        <Descriptions.Item label="Source">Adaa Health Dashboard</Descriptions.Item>
        <Descriptions.Item label="Goal" span={2}>Average nurse-to-bed ratios across ER, OR and ICU to ensure adequate staffing for safe, high-quality care and effective workloads.</Descriptions.Item>
        <Descriptions.Item label="Formula" span={2}>Avg nurses on duty (per area) ÷ operational beds (per area) × 100 — each of ICU/ER/OR coded 1–4, then averaged.</Descriptions.Item>
        <Descriptions.Item label="Inclusion" span={2}>Nurses employed and on the shift schedule, in ICU / ER / OR · all active beds.</Descriptions.Item>
        <Descriptions.Item label="Exclusion" span={2}>Non-patient-care nurses · not on schedule · non-critical areas · non-active beds.</Descriptions.Item>
      </Descriptions>
      <Table size="small" pagination={false} style={{ marginTop: 12 }} rowKey="band"
        dataSource={[
          { band: 'Standard', icu: '≥1:1', er: '≥1:2', or: '≥2:1' },
          { band: 'Distress', icu: '1:2', er: '1:3', or: '1:1' },
          { band: 'Failing', icu: '1:3', er: '1:4', or: '1:2' },
          { band: 'Failed', icu: '1:>4', er: '1:>5', or: '1:>3' },
        ]}
        columns={[
          { title: 'Threshold', dataIndex: 'band', render: (b: Band) => <BandTag band={b} /> },
          { title: 'ICU', dataIndex: 'icu', align: 'center' as const },
          { title: 'ER', dataIndex: 'er', align: 'center' as const },
          { title: 'OR', dataIndex: 'or', align: 'center' as const },
        ]}
      />
    </Card>
  );
}

function IndicatorProfileB() {
  return (
    <Card title={<Space><InfoCircleOutlined /> Indicator Profile — Hospital Nurse to Bed Ratio (QFR-55)</Space>} size="small">
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="Category">Workforce Management</Descriptions.Item>
        <Descriptions.Item label="Owner">Deputyship for Therapeutic Services (MoH)</Descriptions.Item>
        <Descriptions.Item label="Unit">Ratio</Descriptions.Item>
        <Descriptions.Item label="Polarity">Positive</Descriptions.Item>
        <Descriptions.Item label="Frequency">Monthly</Descriptions.Item>
        <Descriptions.Item label="Source">Adaa Health Dashboard</Descriptions.Item>
        <Descriptions.Item label="Goal" span={2}>Average nursing staff available per operational hospital bed over the reporting period — assesses staffing adequacy, workload distribution and workforce planning.</Descriptions.Item>
        <Descriptions.Item label="Formula" span={2}>(Average nurses on duty ÷ number of operational beds × 100) × 100.</Descriptions.Item>
        <Descriptions.Item label="Inclusion" span={2}>Nurses employed and on the shift schedule · all active beds.</Descriptions.Item>
        <Descriptions.Item label="Exclusion" span={2}>Non-patient-care nurses · not on schedule · non-active beds.</Descriptions.Item>
        <Descriptions.Item label="Target" span={2}>1 : &lt;6</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
