#include <winsock2.h>
#include <windows.h>
#include <ws2tcpip.h>

#include <filesystem>
#include <string>
#include <vector>

namespace {

std::string GetModuleDirectory() {
  char module_path[MAX_PATH] = {0};
  GetModuleFileNameA(nullptr, module_path, MAX_PATH);
  std::filesystem::path path(module_path);
  return path.parent_path().string();
}

bool FileExists(const std::string& path) {
  return std::filesystem::exists(std::filesystem::path(path));
}

std::string ToFileUrl(std::string path) {
  for (char& ch : path) {
    if (ch == '\\') ch = '/';
  }
  return "file:///" + path;
}

bool IsLocalDevServerRunning(unsigned short port) {
  WSADATA wsa_data{};
  if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0) return false;

  SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (sock == INVALID_SOCKET) {
    WSACleanup();
    return false;
  }

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

  u_long mode = 1;
  ioctlsocket(sock, FIONBIO, &mode);
  connect(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));

  fd_set write_set;
  FD_ZERO(&write_set);
  FD_SET(sock, &write_set);
  timeval timeout{};
  timeout.tv_sec = 0;
  timeout.tv_usec = 200000;
  int ready = select(0, nullptr, &write_set, nullptr, &timeout);

  closesocket(sock);
  WSACleanup();
  return ready > 0;
}

std::vector<std::string> BrowserCandidates() {
  std::vector<std::string> candidates;
  const char* pf86 = std::getenv("ProgramFiles(x86)");
  const char* pf = std::getenv("ProgramFiles");
  if (pf86) {
    candidates.emplace_back(std::string(pf86) + "\\Microsoft\\Edge\\Application\\msedge.exe");
    candidates.emplace_back(std::string(pf86) + "\\Google\\Chrome\\Application\\chrome.exe");
  }
  if (pf) {
    candidates.emplace_back(std::string(pf) + "\\Microsoft\\Edge\\Application\\msedge.exe");
    candidates.emplace_back(std::string(pf) + "\\Google\\Chrome\\Application\\chrome.exe");
  }
  return candidates;
}

bool LaunchBrowserAppMode(const std::string& target_url) {
  const auto browsers = BrowserCandidates();
  std::string args = "--app=\"" + target_url + "\"";
  for (const auto& browser : browsers) {
    if (!FileExists(browser)) continue;
    HINSTANCE result = ShellExecuteA(nullptr, "open", browser.c_str(), args.c_str(), nullptr, SW_SHOWNORMAL);
    if (reinterpret_cast<intptr_t>(result) > 32) return true;
  }

  HINSTANCE fallback = ShellExecuteA(nullptr, "open", target_url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  return reinterpret_cast<intptr_t>(fallback) > 32;
}

}  // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
  const std::string exe_dir = GetModuleDirectory();
  const std::string packaged_index = exe_dir + "\\web\\index.html";

  std::string target;
  if (IsLocalDevServerRunning(5173)) {
    target = "http://localhost:5173";
  } else if (FileExists(packaged_index)) {
    target = ToFileUrl(packaged_index);
  } else {
    MessageBoxA(nullptr,
                "Quantum Forge could not find a running dev server or packaged web build.\n\n"
                "Option 1: Run npm run dev\n"
                "Option 2: Run npm run build and rebuild desktop target.",
                "Quantum Forge Launcher", MB_OK | MB_ICONWARNING);
    return 1;
  }

  if (!LaunchBrowserAppMode(target)) {
    MessageBoxA(nullptr, "Unable to launch browser app mode. Please install Microsoft Edge or Chrome.",
                "Quantum Forge Launcher", MB_OK | MB_ICONERROR);
    return 1;
  }

  return 0;
}
