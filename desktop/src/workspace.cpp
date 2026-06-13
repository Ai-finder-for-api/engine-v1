#include "workspace.hpp"

#include <sstream>

namespace qforge {

void Workspace::AddFile(const std::string& path, const std::string& content) {
  files_.push_back({path, content});
}

bool Workspace::RenameFile(const std::string& from, const std::string& to) {
  for (auto& file : files_) {
    if (file.path == from) {
      file.path = to;
      return true;
    }
  }
  return false;
}

bool Workspace::DeleteFile(const std::string& path) {
  for (std::size_t i = 0; i < files_.size(); ++i) {
    if (files_[i].path == path) {
      files_.erase(files_.begin() + static_cast<long>(i));
      return true;
    }
  }
  return false;
}

bool Workspace::DuplicateFile(const std::string& from, const std::string& to) {
  for (const auto& file : files_) {
    if (file.path == from) {
      files_.push_back({to, file.content});
      return true;
    }
  }
  return false;
}

bool Workspace::MoveFile(const std::string& from, const std::string& to_folder) {
  for (auto& file : files_) {
    if (file.path == from) {
      auto pos = file.path.find_last_of('/');
      const std::string name = pos == std::string::npos ? file.path : file.path.substr(pos + 1);
      file.path = to_folder + "/" + name;
      return true;
    }
  }
  return false;
}

std::string Workspace::BuildBundle() const {
  std::ostringstream out;
  for (const auto& file : files_) {
    out << "// PATH:" << file.path << "\n";
    out << file.content << "\n\n";
  }
  return out.str();
}

const std::vector<WorkspaceFile>& Workspace::Files() const { return files_; }

}  // namespace qforge
