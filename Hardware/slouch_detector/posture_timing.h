#ifndef BBL_POSTURE_TIMING_H
#define BBL_POSTURE_TIMING_H

#include <stdint.h>

// Device-side timing only: the sketch owns sensing, cumulative totals and BLE.
// uint32_t subtraction preserves elapsed time across the ESP32 millis() wrap.
class PostureTiming {
 public:
  static constexpr uint32_t SLOUCH_MS = 10000;
  static constexpr uint32_t RECOVER_MS = 3000;

  struct Update {
    uint32_t qualifiedMs;  // credit the candidate once when it qualifies
    bool episode;         // one episode per qualified slouch
  };

  void clear() {
    leaning_ = false;
    slouching_ = false;
    recovering_ = false;
  }

  Update update(uint32_t now, bool forward) {
    Update result = {0, false};
    if (forward) {
      if (!leaning_) {
        leaning_ = true;
        leanStart_ = now;
      }
      const uint32_t elapsed = now - leanStart_;
      recovering_ = false;
      if (!slouching_ && elapsed >= SLOUCH_MS) {
        slouching_ = true;
        result.qualifiedMs = elapsed;
        result.episode = true;
      }
    } else {
      leaning_ = false;
      if (slouching_) {
        if (!recovering_) {
          recovering_ = true;
          uprightStart_ = now;
        }
        if (uint32_t(now - uprightStart_) >= RECOVER_MS) {
          slouching_ = false;
          recovering_ = false;
        }
      }
    }
    return result;
  }

  bool slouching() const { return slouching_; }
  uint32_t leanDuration(uint32_t now) const { return leaning_ ? now - leanStart_ : 0; }

 private:
  bool leaning_ = false;
  bool slouching_ = false;
  bool recovering_ = false;
  uint32_t leanStart_ = 0;
  uint32_t uprightStart_ = 0;
};

#endif
