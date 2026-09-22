// Critical path, from whatever logic the schedule actually carries.
//
// Most schedules that reach a PMO are an Excel export with a "Predecessors"
// column and nothing else. That is enough: forward pass, backward pass, float,
// and an honest answer about which chain is driving the completion date. When
// there is no logic at all the caller is told so rather than shown a made-up
// critical path.
import { addDays, daysBetween, maxDate, minDate, startOfDay } from '../dates.js';

const RELATIONS = new Set(['FS', 'SS', 'FF', 'SF']);

/**
 * Parse a predecessor cell: "A100, A110FS+2, 45SS-1d" and the many ways a
 * scheduler writes the same thing.
 */
export function parsePredecessors(text) {
  if (!text) return [];
  // Callers that have already resolved the references pass them through.
  if (Array.isArray(text)) return text;
  return String(text)
    .split(/[,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const match = /^(.*?)(?:\s*(FS|SS|FF|SF))?\s*([+-]\s*\d+(?:\.\d+)?)?\s*(?:d(?:ays?)?)?$/i.exec(token);
      if (!match) return { id: token, relation: 'FS', lag: 0 };
      const relation = (match[2] ?? 'FS').toUpperCase();
      return {
        id: (match[1] ?? '').trim() || token,
        relation: RELATIONS.has(relation) ? relation : 'FS',
        lag: match[3] ? Number(match[3].replace(/\s+/g, '')) : 0,
      };
    })
    .filter((link) => link.id);
}

function topoOrder(nodes) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const node of nodes) {
    for (const link of node.links) {
      if (indegree.has(link.id)) indegree.set(node.id, indegree.get(node.id) + 1);
    }
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const successors = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) {
    for (const link of node.links) {
      if (successors.has(link.id)) successors.get(link.id).push(node.id);
    }
  }

  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(byId.get(id));
    for (const next of successors.get(id) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // A loop in the logic leaves nodes unvisited. Rather than fail, they are
  // appended and reported — a real schedule with a circular dependency still
  // needs a report published on Monday.
  const cycles = nodes.filter((node) => !order.includes(node));
  return { order: [...order, ...cycles], successors, cycles: cycles.map((node) => node.id) };
}

/**
 * Run a forward and backward pass over the remaining work.
 *
 * @param activities  [{id, duration, remainingDuration, actualStart, actualFinish,
 *                     baselineStart, baselineFinish, predecessors}]
 * @param dataDate    progress is measured as at this date
 * @returns {{schedule: Map, finish: Date, criticalPath: string[], hasLogic: boolean, cycles: string[]}}
 */
export function criticalPath(activities, dataDate) {
  const asOf = startOfDay(dataDate) ?? new Date();
  const nodes = activities.map((activity) => ({
    id: String(activity.id),
    duration: Math.max(0, Number(activity.remainingDuration ?? activity.duration ?? 0)),
    activity,
    links: parsePredecessors(activity.predecessors),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hasLogic = nodes.some((node) => node.links.some((link) => byId.has(link.id)));

  const { order, successors, cycles } = topoOrder(nodes);
  const early = new Map();

  for (const node of order) {
    const activity = node.activity;
    if (activity.actualFinish) {
      const finish = startOfDay(activity.actualFinish);
      early.set(node.id, { start: startOfDay(activity.actualStart) ?? finish, finish, done: true });
      continue;
    }
    // A started activity cannot begin again; an unstarted one cannot begin
    // before the data date, whatever the baseline once said.
    let start = activity.actualStart ? maxDate(startOfDay(activity.actualStart), asOf) : asOf;
    for (const link of node.links) {
      const predecessor = early.get(link.id);
      if (!predecessor) continue;
      const base = link.relation === 'SS' || link.relation === 'SF' ? predecessor.start : addDays(predecessor.finish, 1);
      const candidate = addDays(base, link.lag);
      if (link.relation === 'FF' || link.relation === 'SF') {
        const implied = addDays(candidate, -node.duration + 1);
        if (implied > start) start = implied;
      } else if (candidate > start) start = candidate;
    }
    const finish = addDays(start, Math.max(node.duration - 1, 0));
    early.set(node.id, { start, finish, done: false });
  }

  const finishes = [...early.values()].map((entry) => entry.finish).filter(Boolean);
  const projectFinish = finishes.length ? maxDate(...finishes) : null;

  const late = new Map();
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = order[i];
    const own = early.get(node.id);
    if (!own) continue;
    if (own.done) {
      late.set(node.id, { start: own.start, finish: own.finish });
      continue;
    }
    let lateFinish = projectFinish;
    for (const successorId of successors.get(node.id) ?? []) {
      const successor = late.get(successorId);
      const successorNode = byId.get(successorId);
      if (!successor || !successorNode) continue;
      const link = successorNode.links.find((item) => item.id === node.id);
      const lag = link?.lag ?? 0;
      const candidate = link?.relation === 'SS' || link?.relation === 'SF'
        ? addDays(successor.start, -lag + Math.max(node.duration - 1, 0))
        : addDays(successor.start, -1 - lag);
      lateFinish = minDate(lateFinish, candidate);
    }
    late.set(node.id, { start: addDays(lateFinish, -Math.max(node.duration - 1, 0)), finish: lateFinish });
  }

  const schedule = new Map();
  for (const node of nodes) {
    const e = early.get(node.id);
    const l = late.get(node.id);
    const float = e && l && !e.done ? daysBetween(e.finish, l.finish) : null;
    schedule.set(node.id, {
      id: node.id,
      earlyStart: e?.start ?? null,
      earlyFinish: e?.finish ?? null,
      lateStart: l?.start ?? null,
      lateFinish: l?.finish ?? null,
      totalFloat: float,
      critical: float !== null && float <= 0,
      complete: Boolean(e?.done),
    });
  }

  const criticalIds = [...schedule.values()]
    .filter((entry) => entry.critical)
    .sort((a, b) => (a.earlyStart ?? 0) - (b.earlyStart ?? 0))
    .map((entry) => entry.id);

  return { schedule, finish: projectFinish, criticalPath: criticalIds, hasLogic, cycles };
}

/**
 * When the schedule carries no logic, the honest substitute is the chain of
 * work that is actually late: the activities whose forecast finish is pushing
 * the project date, ranked by how far.
 */
export function drivingActivities(activities, { limit = 12 } = {}) {
  return activities
    .filter((activity) => !activity.complete && activity.slippageDays > 0)
    .sort((a, b) => b.slippageDays - a.slippageDays || (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
}
