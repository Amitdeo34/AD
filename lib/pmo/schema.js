// The canonical vocabulary of the engine.
//
// No two clients name their columns the same way. "Cum. Qty", "Qty till date",
// "Progress Till Date" and "Aaj tak ki matra" are one field, and the moment
// they are, every report can be generated from every project. This file is
// that agreement: the document types a project produces, the fields each one
// carries, and every spelling those fields turn up under on site.
//
// Adding a client's local wording is a one-line change to `aliases` — no
// parser, analytic or report needs to know.

const D = (key, label, type, aliases, extra = {}) => ({ key, label, type, aliases, ...extra });

export const DOC_TYPES = {
  dpr: {
    label: 'Daily Progress Report (DPR)',
    short: 'DPR',
    description: 'The day-by-day site record: what was done, by how many people, with what plant, and what got in the way.',
    grain: 'one row per activity per day',
    essential: true,
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('date', 'Date', 'date', ['date', 'dt', 'report date', 'dpr date', 'progress date', 'day', 'dated', 'reporting date', 'date of work', 'tarikh'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'zone', 'package', 'pkg', 'block', 'section', 'location', 'site', 'chainage', 'building', 'tower', 'reach', 'segment', 'stretch', 'ward', 'village', 'sector', 'phase']),
      D('wbsId', 'WBS / Activity ID', 'text', ['wbs', 'wbs id', 'wbs code', 'activity id', 'act id', 'activity code', 'task id', 'id', 'item code', 'sl no', 'boq code', 'ref']),
      D('activity', 'Activity', 'text', ['activity', 'activity name', 'description', 'description of work', 'work description', 'item', 'item of work', 'task', 'task name', 'work', 'nature of work', 'particulars', 'kaam'], { required: true }),
      D('unit', 'Unit', 'text', ['unit', 'uom', 'units', 'measure', 'unit of measurement']),
      D('plannedQty', 'Planned qty (today)', 'number', ['planned qty', 'plan qty', 'target qty', 'planned quantity', 'today plan', 'plan for the day', 'target', 'planned', 'day plan', 'scheduled qty']),
      D('actualQty', 'Actual qty (today)', 'number', ['actual qty', 'qty achieved', 'achieved qty', 'today progress', 'progress qty', 'quantity executed', 'executed qty', 'work done', 'qty done', 'achievement', 'actual', 'todays progress', 'daily progress', 'qty']),
      D('cumulativeQty', 'Cumulative qty', 'number', ['cumulative qty', 'cum qty', 'cumulative', 'qty till date', 'till date', 'upto date', 'progress till date', 'total qty', 'to date qty', 'cumulative progress', 'aggregate qty']),
      D('scopeQty', 'Total scope qty', 'number', ['total qty', 'scope qty', 'boq qty', 'contract qty', 'tender qty', 'total quantity', 'overall qty']),
      D('manpowerActual', 'Manpower (actual)', 'number', ['manpower', 'labour', 'labor', 'manpower actual', 'total manpower', 'workers', 'men', 'head count', 'headcount', 'labour deployed', 'manpower deployed', 'staff', 'mazdoor']),
      D('manpowerPlanned', 'Manpower (planned)', 'number', ['manpower planned', 'planned manpower', 'labour planned', 'manpower required', 'required manpower', 'manpower plan']),
      D('equipmentActual', 'Equipment (actual)', 'number', ['equipment', 'machinery', 'plant', 'equipment deployed', 'machines', 'no of machines', 'equipment actual', 'plant deployed']),
      D('equipmentPlanned', 'Equipment (planned)', 'number', ['equipment planned', 'planned equipment', 'machinery planned', 'equipment required']),
      D('workingHours', 'Working hours', 'number', ['working hours', 'hours', 'shift hours', 'man hours', 'manhours', 'hrs worked', 'duration hours']),
      D('weather', 'Weather', 'text', ['weather', 'weather condition', 'climate', 'rain', 'rainfall', 'mausam']),
      D('hindrance', 'Hindrance', 'text', ['hindrance', 'constraint', 'issue', 'delay reason', 'reason for delay', 'bottleneck', 'obstruction', 'problem', 'dikkat', 'reason']),
      D('safetyIncidents', 'Safety incidents', 'number', ['safety incidents', 'incidents', 'accidents', 'near miss', 'lti', 'safety']),
      D('remarks', 'Remarks', 'text', ['remarks', 'remark', 'comments', 'comment', 'notes', 'observation', 'observations', 'status remarks']),
      D('contractor', 'Contractor / Agency', 'text', ['contractor', 'agency', 'vendor', 'subcontractor', 'sub contractor', 'firm', 'executing agency']),
    ],
  },

  schedule: {
    label: 'Baseline schedule / WBS',
    short: 'Schedule',
    description: 'The programme: activities, baseline dates, logic and weightings. Drives slippage, critical path and the S-curve.',
    grain: 'one row per activity',
    essential: true,
    fields: [
      D('wbsId', 'Activity ID', 'text', ['activity id', 'act id', 'id', 'wbs', 'wbs id', 'wbs code', 'task id', 'uid', 'task_id', 'code', 'sr no', 'sl no'], { required: true }),
      D('activity', 'Activity', 'text', ['activity', 'activity name', 'task name', 'task', 'description', 'name', 'work', 'task_name', 'particulars'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'zone', 'package', 'block', 'section', 'location', 'tower', 'building', 'phase', 'reach']),
      D('parentId', 'Parent / Summary ID', 'text', ['parent', 'parent id', 'summary id', 'wbs parent', 'level 2', 'group']),
      D('level', 'WBS level', 'number', ['level', 'outline level', 'wbs level', 'outlinelevel']),
      D('unit', 'Unit', 'text', ['unit', 'uom', 'unit of measurement']),
      D('scopeQty', 'Scope qty', 'number', ['qty', 'quantity', 'boq qty', 'total qty', 'scope qty', 'contract qty']),
      D('weight', 'Weightage', 'percent', ['weight', 'weightage', 'weight %', 'wtg', 'weightage %', 'value weight', 'relative weight']),
      D('value', 'Activity value', 'money', ['value', 'amount', 'cost', 'budget', 'activity value', 'contract value', 'budgeted cost']),
      D('duration', 'Duration (days)', 'number', ['duration', 'orig duration', 'original duration', 'planned duration', 'days', 'dur']),
      D('baselineStart', 'Baseline start', 'date', ['baseline start', 'planned start', 'scheduled start', 'bl start', 'target start', 'start date', 'start', 'early start', 'plan start'], { required: true }),
      D('baselineFinish', 'Baseline finish', 'date', ['baseline finish', 'planned finish', 'scheduled finish', 'bl finish', 'target finish', 'finish date', 'finish', 'end date', 'completion date', 'early finish', 'plan finish'], { required: true }),
      D('actualStart', 'Actual start', 'date', ['actual start', 'act start', 'commenced on', 'start actual', 'date of start']),
      D('actualFinish', 'Actual finish', 'date', ['actual finish', 'act finish', 'completed on', 'finish actual', 'date of completion']),
      D('forecastStart', 'Forecast start', 'date', ['forecast start', 'expected start', 'revised start', 'projected start']),
      D('forecastFinish', 'Forecast finish', 'date', ['forecast finish', 'expected finish', 'revised finish', 'projected finish', 'anticipated completion', 'revised completion']),
      D('actualPct', '% complete', 'percent', ['percent complete', '% complete', 'progress %', 'physical progress', 'completion %', 'actual %', 'pct complete', '% achieved', 'progress']),
      D('plannedPct', 'Planned %', 'percent', ['planned %', 'plan %', 'scheduled %', 'target %', 'planned progress']),
      D('predecessors', 'Predecessors', 'text', ['predecessors', 'predecessor', 'depends on', 'pred', 'logic', 'relationship']),
      D('totalFloat', 'Total float (days)', 'number', ['total float', 'float', 'slack', 'total slack', 'tf']),
      D('isMilestone', 'Milestone?', 'bool', ['milestone', 'is milestone', 'key date']),
      D('isCritical', 'Critical?', 'bool', ['critical', 'is critical', 'critical path']),
      D('owner', 'Responsibility', 'text', ['owner', 'responsibility', 'responsible', 'agency', 'contractor', 'department']),
    ],
  },

  boq: {
    label: 'Bill of Quantities (BOQ)',
    short: 'BOQ',
    description: 'Quantities and rates. This is what turns raw progress into weighted, value-based percentages.',
    grain: 'one row per BOQ item',
    essential: true,
    fields: [
      D('itemCode', 'Item code', 'text', ['item code', 'item no', 'boq code', 'code', 'sl no', 'sr no', 'item', 's no'], { required: true }),
      D('description', 'Description', 'text', ['description', 'item description', 'particulars', 'description of item', 'work item', 'nature of work'], { required: true }),
      D('wbsId', 'WBS / Activity ID', 'text', ['wbs', 'wbs id', 'activity id', 'linked activity', 'act id']),
      D('area', 'Area / Package', 'text', ['area', 'zone', 'package', 'block', 'building', 'section', 'tower']),
      D('unit', 'Unit', 'text', ['unit', 'uom', 'unit of measurement']),
      D('qty', 'Quantity', 'number', ['qty', 'quantity', 'boq qty', 'tender qty', 'total qty', 'contract qty'], { required: true }),
      D('rate', 'Rate', 'money', ['rate', 'unit rate', 'price', 'unit price', 'rate in rs', 'rate (inr)']),
      D('amount', 'Amount', 'money', ['amount', 'value', 'total amount', 'cost', 'total', 'amount in rs']),
      D('executedQty', 'Executed qty', 'number', ['executed qty', 'qty executed', 'cum qty', 'qty till date', 'achieved qty', 'work done qty']),
    ],
  },

  milestones: {
    label: 'Contract milestones',
    short: 'Milestones',
    description: 'The dates the contract is judged on. Drives the milestone watch-list and any penalty exposure.',
    grain: 'one row per milestone',
    fields: [
      D('milestoneId', 'Milestone ID', 'text', ['milestone id', 'id', 'ms id', 'sl no', 'sr no', 'code']),
      D('name', 'Milestone', 'text', ['milestone', 'name', 'description', 'milestone description', 'key date', 'event'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'section']),
      D('baselineDate', 'Contract date', 'date', ['baseline date', 'contract date', 'planned date', 'target date', 'due date', 'scheduled date', 'agreed date'], { required: true }),
      D('forecastDate', 'Forecast date', 'date', ['forecast date', 'expected date', 'revised date', 'anticipated date', 'projected date']),
      D('actualDate', 'Actual date', 'date', ['actual date', 'achieved date', 'date achieved', 'completion date']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('weight', 'Weightage', 'percent', ['weight', 'weightage', 'payment %', 'value %']),
      D('penalty', 'Penalty / LD exposure', 'money', ['penalty', 'ld', 'liquidated damages', 'ld amount', 'penalty amount', 'exposure']),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'responsible', 'agency']),
    ],
  },

  risks: {
    label: 'Risk register',
    short: 'Risks',
    description: 'Open risks with probability and impact. Scored 5×5 and rolled into every report.',
    grain: 'one row per risk',
    fields: [
      D('riskId', 'Risk ID', 'text', ['risk id', 'id', 'sl no', 'sr no', 'ref']),
      D('description', 'Risk', 'text', ['risk', 'description', 'risk description', 'risk statement', 'particulars'], { required: true }),
      D('category', 'Category', 'text', ['category', 'type', 'risk category', 'classification']),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block']),
      D('probability', 'Probability (1-5)', 'number', ['probability', 'likelihood', 'prob', 'p']),
      D('impact', 'Impact (1-5)', 'number', ['impact', 'severity', 'consequence', 'i']),
      D('exposure', 'Exposure', 'money', ['exposure', 'cost impact', 'value at risk', 'financial impact']),
      D('scheduleImpact', 'Schedule impact (days)', 'number', ['schedule impact', 'time impact', 'delay days', 'days impact']),
      D('mitigation', 'Mitigation', 'text', ['mitigation', 'mitigation plan', 'response', 'action', 'control', 'treatment']),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'responsible', 'action by', 'assigned to']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('dueDate', 'Target date', 'date', ['due date', 'target date', 'by when', 'closure date', 'review date']),
      D('raisedOn', 'Raised on', 'date', ['raised on', 'identified on', 'date raised', 'opened on', 'date']),
    ],
  },

  issues: {
    label: 'Issue / action log',
    short: 'Issues',
    description: 'Live issues and open actions, with owners and ageing. Carried forward week to week.',
    grain: 'one row per issue or action',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('issueId', 'Issue ID', 'text', ['issue id', 'id', 'action id', 'sl no', 'sr no', 'ref']),
      D('description', 'Issue / action', 'text', ['issue', 'action', 'description', 'issue description', 'action item', 'point', 'particulars'], { required: true }),
      D('category', 'Category', 'text', ['category', 'type', 'classification', 'discipline']),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'location']),
      D('raisedOn', 'Raised on', 'date', ['raised on', 'date raised', 'opened on', 'date', 'reported on', 'logged on'], { required: true }),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'responsible', 'action by', 'assigned to', 'with whom']),
      D('dueDate', 'Due date', 'date', ['due date', 'target date', 'by when', 'target closure', 'required by']),
      D('closedOn', 'Closed on', 'date', ['closed on', 'date closed', 'resolved on', 'completion date']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('priority', 'Priority', 'text', ['priority', 'severity', 'criticality', 'importance']),
      D('impactDays', 'Schedule impact (days)', 'number', ['impact days', 'delay days', 'schedule impact', 'days lost']),
      D('resolution', 'Resolution / next step', 'text', ['resolution', 'next step', 'action taken', 'remarks', 'way forward', 'comments']),
    ],
  },

  ncr: {
    label: 'Quality — NCRs & observations',
    short: 'Quality',
    description: 'Non-conformance reports and site quality observations, with ageing on anything still open.',
    grain: 'one row per NCR or observation',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('ncrId', 'NCR no.', 'text', ['ncr no', 'ncr id', 'id', 'sl no', 'sr no', 'ref', 'observation no']),
      D('description', 'Description', 'text', ['description', 'non conformance', 'observation', 'ncr description', 'issue', 'particulars'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'location', 'element']),
      D('raisedOn', 'Raised on', 'date', ['raised on', 'date raised', 'issued on', 'date', 'reported on'], { required: true }),
      D('closedOn', 'Closed on', 'date', ['closed on', 'date closed', 'rectified on', 'closure date']),
      D('severity', 'Severity', 'text', ['severity', 'category', 'classification', 'priority', 'type']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'responsible', 'contractor', 'action by']),
      D('discipline', 'Discipline', 'text', ['discipline', 'trade', 'system', 'work type']),
      D('correctiveAction', 'Corrective action', 'text', ['corrective action', 'action', 'action taken', 'remarks', 'capa']),
    ],
  },

  safety: {
    label: 'Safety — incidents & observations',
    short: 'Safety',
    description: 'EHS record: incidents, near misses, observations and safe man-hours.',
    grain: 'one row per incident or observation',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('date', 'Date', 'date', ['date', 'incident date', 'date of incident', 'reported on'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'location']),
      D('type', 'Type', 'text', ['type', 'incident type', 'category', 'classification', 'nature'], { required: true }),
      D('description', 'Description', 'text', ['description', 'details', 'incident', 'observation', 'particulars']),
      D('severity', 'Severity', 'text', ['severity', 'category', 'classification', 'priority']),
      D('lti', 'Lost time injury?', 'bool', ['lti', 'lost time injury', 'reportable', 'is lti']),
      D('manHours', 'Safe man-hours', 'number', ['man hours', 'manhours', 'safe man hours', 'hours worked', 'man hours worked']),
      D('personsAffected', 'Persons affected', 'number', ['persons affected', 'injured', 'no of persons', 'affected']),
      D('status', 'Status', 'text', ['status', 'closure status', 'state']),
      D('correctiveAction', 'Corrective action', 'text', ['corrective action', 'action taken', 'action', 'remarks']),
    ],
  },

  billing: {
    label: 'Billing / IPC certification',
    short: 'Billing',
    description: 'Interim payment certificates: claimed, certified, paid. Feeds financial progress and cost performance.',
    grain: 'one row per invoice or RA bill',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('invoiceId', 'Bill / IPC no.', 'text', ['invoice no', 'bill no', 'ra bill', 'ipc no', 'id', 'certificate no', 'sl no'], { required: true }),
      D('period', 'Period', 'text', ['period', 'month', 'billing period', 'for the month of']),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'contract']),
      D('contractor', 'Contractor', 'text', ['contractor', 'agency', 'vendor', 'firm']),
      D('claimedAmount', 'Claimed', 'money', ['claimed', 'claimed amount', 'gross claim', 'amount claimed', 'bill amount', 'submitted amount']),
      D('certifiedAmount', 'Certified', 'money', ['certified', 'certified amount', 'recommended amount', 'passed amount', 'approved amount']),
      D('paidAmount', 'Paid', 'money', ['paid', 'paid amount', 'released', 'payment released', 'amount paid']),
      D('submittedOn', 'Submitted on', 'date', ['submitted on', 'date of submission', 'received on', 'bill date', 'date']),
      D('certifiedOn', 'Certified on', 'date', ['certified on', 'date certified', 'recommended on', 'approval date']),
      D('paidOn', 'Paid on', 'date', ['paid on', 'payment date', 'released on']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('deductions', 'Deductions', 'money', ['deductions', 'recovery', 'retention', 'withheld', 'less']),
    ],
  },

  cashflow: {
    label: 'Cash flow plan',
    short: 'Cash flow',
    description: 'Planned spend by month, against which actual certification is tracked.',
    grain: 'one row per month',
    fields: [
      D('period', 'Month', 'date', ['month', 'period', 'date', 'for the month'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone']),
      D('plannedAmount', 'Planned', 'money', ['planned', 'plan', 'budget', 'planned amount', 'projected', 'forecast']),
      D('actualAmount', 'Actual', 'money', ['actual', 'actual amount', 'spent', 'certified', 'incurred']),
    ],
  },

  hindrance: {
    label: 'Hindrance register',
    short: 'Hindrances',
    description: 'Every constraint stopping work, who owns it and how long it has been open — the backbone of an EOT case.',
    grain: 'one row per hindrance',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('hindranceId', 'Hindrance ID', 'text', ['hindrance id', 'id', 'sl no', 'sr no', 'ref']),
      D('description', 'Hindrance', 'text', ['hindrance', 'description', 'constraint', 'issue', 'nature of hindrance', 'particulars'], { required: true }),
      D('type', 'Type', 'text', ['type', 'category', 'classification', 'nature']),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'location', 'chainage', 'block']),
      D('raisedOn', 'From date', 'date', ['from date', 'date', 'start date', 'raised on', 'reported on', 'occurred on'], { required: true }),
      D('closedOn', 'To date', 'date', ['to date', 'end date', 'closed on', 'cleared on', 'resolved on']),
      D('responsibility', 'Responsibility', 'text', ['responsibility', 'responsible', 'owner', 'attributable to', 'agency', 'action by']),
      D('impactDays', 'Impact (days)', 'number', ['impact days', 'delay days', 'days lost', 'time impact', 'idle days']),
      D('affectedActivity', 'Activity affected', 'text', ['activity affected', 'affected activity', 'activity', 'work affected', 'wbs']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
    ],
  },

  procurement: {
    label: 'Procurement / material status',
    short: 'Procurement',
    description: 'Long-lead items and materials against the date the site needs them.',
    grain: 'one row per item',
    fields: [
      D('itemCode', 'Item code', 'text', ['item code', 'code', 'sl no', 'sr no', 'po no', 'id']),
      D('description', 'Item', 'text', ['item', 'description', 'material', 'particulars', 'material description'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block']),
      D('qty', 'Quantity', 'number', ['qty', 'quantity', 'order qty', 'required qty']),
      D('unit', 'Unit', 'text', ['unit', 'uom']),
      D('requiredBy', 'Required on site by', 'date', ['required by', 'required on site by', 'need date', 'site requirement date', 'rdd', 'target date'], { required: true }),
      D('orderedOn', 'Ordered on', 'date', ['ordered on', 'po date', 'order date', 'date of order']),
      D('deliveredOn', 'Delivered on', 'date', ['delivered on', 'delivery date', 'received on', 'date of receipt', 'actual delivery']),
      D('status', 'Status', 'text', ['status', 'current status', 'state']),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'vendor', 'supplier', 'agency']),
      D('value', 'Value', 'money', ['value', 'amount', 'po value', 'cost']),
    ],
  },

  drawings: {
    label: 'Drawing / design register',
    short: 'Drawings',
    description: 'Design deliverables and approval status — the most common upstream cause of site idling.',
    grain: 'one row per drawing',
    fields: [
      D('drawingNo', 'Drawing no.', 'text', ['drawing no', 'dwg no', 'document no', 'id', 'sl no', 'ref'], { required: true }),
      D('title', 'Title', 'text', ['title', 'description', 'drawing title', 'particulars'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'discipline']),
      D('revision', 'Revision', 'text', ['revision', 'rev', 'rev no', 'version']),
      D('requiredBy', 'Required by', 'date', ['required by', 'need date', 'target date', 'ifc required by', 'rdd']),
      D('submittedOn', 'Submitted on', 'date', ['submitted on', 'submission date', 'date submitted', 'issued on']),
      D('approvedOn', 'Approved on', 'date', ['approved on', 'approval date', 'date approved', 'ifc date', 'released on']),
      D('status', 'Status', 'text', ['status', 'current status', 'state', 'approval status']),
      D('owner', 'Owner', 'text', ['owner', 'responsibility', 'consultant', 'designer', 'action by']),
    ],
  },

  manpower: {
    label: 'Manpower deployment',
    short: 'Manpower',
    description: 'Planned against deployed strength by trade — used when the DPR does not carry it inline.',
    grain: 'one row per day per trade',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('date', 'Date', 'date', ['date', 'day', 'reporting date'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'location']),
      D('trade', 'Trade / category', 'text', ['trade', 'category', 'skill', 'designation', 'type', 'classification'], { required: true }),
      D('planned', 'Planned', 'number', ['planned', 'plan', 'required', 'target', 'as per plan']),
      D('actual', 'Actual', 'number', ['actual', 'deployed', 'present', 'available', 'attendance', 'strength']),
      D('contractor', 'Contractor', 'text', ['contractor', 'agency', 'vendor', 'firm']),
    ],
  },

  equipment: {
    label: 'Equipment deployment',
    short: 'Equipment',
    description: 'Plant on site, working against idle — the fastest read on whether a delay is resourcing or sequencing.',
    grain: 'one row per day per equipment type',
    // Records what has already happened, so a date beyond the data date is
    // a typo rather than a plan.
    retrospective: true,
    fields: [
      D('date', 'Date', 'date', ['date', 'day', 'reporting date'], { required: true }),
      D('area', 'Area / Package', 'text', ['area', 'package', 'zone', 'block', 'location']),
      D('equipment', 'Equipment', 'text', ['equipment', 'machine', 'machinery', 'plant', 'type', 'description'], { required: true }),
      D('planned', 'Planned', 'number', ['planned', 'plan', 'required', 'target']),
      D('actual', 'Deployed', 'number', ['actual', 'deployed', 'available', 'on site', 'nos']),
      D('working', 'Working', 'number', ['working', 'in use', 'operational', 'running']),
      D('idle', 'Idle / breakdown', 'number', ['idle', 'breakdown', 'not working', 'down', 'under repair']),
      D('hours', 'Hours run', 'number', ['hours', 'hours run', 'running hours', 'utilisation hours']),
    ],
  },
};

/** Field definitions for a document type, keyed by canonical key. */
export function fieldsOf(docType) {
  const spec = DOC_TYPES[docType];
  if (!spec) throw new Error(`Unknown document type "${docType}"`);
  return spec.fields;
}

export function fieldOf(docType, key) {
  return fieldsOf(docType).find((field) => field.key === key) ?? null;
}

export function requiredFields(docType) {
  return fieldsOf(docType).filter((field) => field.required);
}

export const DOC_TYPE_KEYS = Object.keys(DOC_TYPES);

/** Document types that record the past; the rest describe what is to come. */
export const RETROSPECTIVE_DOC_TYPES = DOC_TYPE_KEYS.filter((key) => DOC_TYPES[key].retrospective);

/** The document types a project cannot produce meaningful reports without. */
export const ESSENTIAL_DOC_TYPES = DOC_TYPE_KEYS.filter((key) => DOC_TYPES[key].essential);
