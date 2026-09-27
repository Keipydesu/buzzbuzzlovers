export const states = ['idle', 'calibrating', 'upright', 'slouching', 'sensor_error', 'ended'];
export function decode(buffer) {
  const v = buffer instanceof DataView ? buffer : new DataView(buffer);
  if (v.byteLength !== 20 || v.getUint8(0) !== 1 || !states[v.getUint8(1)]) throw Error('Invalid BLE packet');
  const data = {session_id:v.getUint32(2,true), protocol_version:1, state:states[v.getUint8(1)], sequence:v.getUint32(6,true), tracked_seconds:v.getUint32(10,true), slouch_seconds:v.getUint32(14,true), episode_count:v.getUint16(18,true)};
  if (data.slouch_seconds > data.tracked_seconds || (data.session_id && !data.sequence)) throw Error('Invalid BLE counters');
  if (!data.session_id && (data.state !== 'idle' || data.sequence || data.tracked_seconds || data.slouch_seconds || data.episode_count)) throw Error('Invalid idle packet');
  return data;
}
export function encode(s) {
  const v = new DataView(new ArrayBuffer(20));
  v.setUint8(0,1); v.setUint8(1,states.indexOf(s.state));
  for (const [offset,key] of [[2,'session_id'],[6,'sequence'],[10,'tracked_seconds'],[14,'slouch_seconds']]) v.setUint32(offset,s[key],true);
  v.setUint16(18,s.episode_count,true);return v.buffer;
}
export function reconcile(previous, incoming) {
  if (!previous) return 'accepted';
  if (incoming.sequence < previous.sequence) return 'stale';
  if (incoming.sequence === previous.sequence) {
    if (Object.keys(incoming).some(k=>incoming[k] !== previous[k])) throw Error('Conflicting packet revision');
    return 'duplicate';
  }
  if (previous.state === 'ended') throw Error('Ended session cannot reopen');
  if (['tracked_seconds','slouch_seconds','episode_count'].some(k=>incoming[k]<previous[k])) throw Error('Counter regression');
  return 'accepted';
}
