#pragma once

#include <string>
#include <vector>

namespace qforge {

struct WorkspaceFile {
  std::string path;
  std::string content;
};

class Workspace {
 public:
  void AddFile(const std::string& path, const std::string& content);
  bool RenameFile(const std::string& from, const std::string& to);
  bool DeleteFile(const std::string& path);
  bool DuplicateFile(const std::string& from, const std::string& to);
  bool MoveFile(const std::string& from, const std::string& to_folder);
  std::string BuildBundle() const;
  const std::vector<WorkspaceFile>& Files() const;

 private:
  std::vector<WorkspaceFile> files_;
};

}  // namespace qforge
