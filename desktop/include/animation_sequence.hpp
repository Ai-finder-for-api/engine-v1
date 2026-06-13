#pragma once

#include <string>
#include <vector>

namespace qforge {

struct SequenceStep {
  std::string clip_name;
  float speed;
  int loop_count;
  float blend_sec;
};

struct MarkerEvent {
  float normalized_time;
  std::string label;
};

class AnimationSequencer {
 public:
  void AddStep(const SequenceStep& step);
  void AddMarker(const MarkerEvent& marker);
  float EvaluateDuration(float clip_duration_seconds) const;
  std::string PreviewCrossfadePlan() const;

 private:
  std::vector<SequenceStep> steps_;
  std::vector<MarkerEvent> markers_;
};

}  // namespace qforge
