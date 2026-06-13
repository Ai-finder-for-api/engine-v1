#include "animation_sequence.hpp"

#include <sstream>

namespace qforge {

void AnimationSequencer::AddStep(const SequenceStep& step) { steps_.push_back(step); }

void AnimationSequencer::AddMarker(const MarkerEvent& marker) { markers_.push_back(marker); }

float AnimationSequencer::EvaluateDuration(float clip_duration_seconds) const {
  float total = 0.0f;
  for (const auto& step : steps_) {
    const float speed = step.speed > 0.1f ? step.speed : 1.0f;
    total += (clip_duration_seconds / speed) * static_cast<float>(step.loop_count > 0 ? step.loop_count : 1);
    total += step.blend_sec;
  }
  return total;
}

std::string AnimationSequencer::PreviewCrossfadePlan() const {
  std::ostringstream out;
  for (std::size_t i = 0; i < steps_.size(); ++i) {
    const auto& step = steps_[i];
    out << "[Step " << i + 1 << "] " << step.clip_name << " speed=" << step.speed << " loops=" << step.loop_count;
    if (i + 1 < steps_.size()) {
      out << " -> crossfade(" << step.blend_sec << "s) -> " << steps_[i + 1].clip_name;
    }
    out << "\n";
  }
  for (const auto& marker : markers_) {
    out << "Marker " << marker.label << " @ " << marker.normalized_time << "\n";
  }
  return out.str();
}

}  // namespace qforge
