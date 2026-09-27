#include <assert.h>
#include <stdio.h>
#include <initializer_list>
#include "../../Hardware/slouch_detector/posture_timing.h"

// Same interval-accounting order as loop(): credit the previous state, then
// sample/update and credit a newly qualified candidate. No Arduino dependency.
struct Tracker {
  PostureTiming timing;
  uint32_t last = 0;
  uint64_t tracked = 0, slouch = 0;
  unsigned episodes = 0;

  void sample(uint32_t now, bool forward) {
    const uint32_t dt = now - last;
    last = now;
    tracked += dt;
    if (timing.slouching()) slouch += dt;
    const auto result = timing.update(now, forward);
    slouch += result.qualifiedMs;
    episodes += result.episode;
    assert(slouch <= tracked);
  }
};

int main() {
  PostureTiming warning;
  assert(warning.warningPhase() == 0);
  warning.update(0, true);
  assert(warning.warningPhase() == 1 && warning.warningElapsed(7000) == 7000);
  warning.update(10000, true);
  assert(warning.warningPhase() == 2 && warning.warningElapsed(10000) == 10000);
  warning.update(11000, false);
  assert(warning.warningPhase() == 3 && warning.warningElapsed(12500) == 1500);
  warning.update(14000, false);
  assert(warning.warningPhase() == 0 && warning.warningElapsed(14000) == 0);
  Tracker t;
  t.sample(0, true);
  t.sample(9999, true);
  assert(t.slouch == 0 && !t.timing.slouching());
  t.sample(10000, true);
  assert(t.slouch == 10000 && t.timing.slouching() && t.episodes == 1);
  t.sample(11000, true);
  assert(t.slouch == 11000);  // no repeated qualification credit
  t.sample(12000, false);
  t.sample(14999, false);
  assert(t.timing.slouching() && t.slouch == 14999);
  t.sample(15000, false);
  assert(!t.timing.slouching() && t.slouch == 15000);
  t.sample(16000, false);
  assert(t.slouch == 15000);

  Tracker shortLeans;
  shortLeans.sample(0, true);
  shortLeans.sample(9999, false);
  shortLeans.sample(10000, true);
  shortLeans.sample(19999, true);
  assert(shortLeans.slouch == 0);
  shortLeans.sample(20123, true);
  assert(shortLeans.slouch == 10123);  // sample overshoot, not just constant 10000

  Tracker recovery;
  recovery.sample(0, true);
  recovery.sample(10000, true);
  recovery.sample(11000, false);
  recovery.sample(13999, true);
  recovery.sample(23999, true);
  assert(recovery.slouch == 23999 && recovery.episodes == 1);
  recovery.sample(25000, false);
  recovery.sample(27999, false);
  assert(recovery.timing.slouching());
  recovery.sample(28000, false);
  assert(!recovery.timing.slouching());
  recovery.sample(30000, true);
  recovery.sample(40000, true);
  assert(recovery.slouch == 38000);  // a new candidate credits exactly once
  assert(recovery.episodes == 2);

  Tracker episodes;
  episodes.sample(0, true);
  episodes.sample(10000, true);
  episodes.sample(60000, true);
  assert(episodes.episodes == 1);
  episodes.sample(60001, true);
  episodes.sample(90000, true);
  assert(episodes.episodes == 1);
  episodes.sample(90001, false);
  episodes.sample(90002, true);  // brief recovery never re-arms an episode
  episodes.sample(150002, true);
  assert(episodes.episodes == 1);
  episodes.sample(150003, true);
  assert(episodes.episodes == 1 && episodes.slouch == 150003);

  for (bool qualified : {false, true}) {
    PostureTiming reset;
    reset.update(0, true);
    reset.update(qualified ? 10000 : 9000, true);
    reset.clear();  // both calibration and classified sensor error use this
    assert(!reset.slouching());
    assert(reset.update(100000, true).qualifiedMs == 0);
    assert(reset.update(109999, true).qualifiedMs == 0);
    assert(reset.update(110000, true).qualifiedMs == 10000);
  }

  Tracker wrap;
  wrap.last = UINT32_MAX - 5000;
  wrap.sample(wrap.last, true);
  wrap.sample(4998, true);
  assert(wrap.slouch == 0);
  wrap.sample(4999, true);
  assert(wrap.slouch == 10000);
  wrap.sample(UINT32_MAX - 5000 + uint32_t(60001), true);
  assert(wrap.episodes == 1);
  PostureTiming recoveryWrap;
  recoveryWrap.update(UINT32_MAX - 20000, true);
  recoveryWrap.update(UINT32_MAX - 10000, true);
  recoveryWrap.update(UINT32_MAX - 1000, false);
  recoveryWrap.update(1998, false);
  assert(recoveryWrap.slouching());
  recoveryWrap.update(1999, false);
  assert(!recoveryWrap.slouching());

  puts("Firmware timing checks passed: qualification/backfill, recovery, episodes, reset, wrap.");
}
