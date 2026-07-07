import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import 'login_screen.dart';

class StudentDashboard extends StatefulWidget {
  final Map<String, dynamic> studentData;
  const StudentDashboard({super.key, required this.studentData});

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  final ApiService _apiService = ApiService();
  final MobileScannerController _scannerController = MobileScannerController();
  
  // Navigation State
  int _currentIndex = 0;

  // Leave Form Controllers
  final _reasonController = TextEditingController();
  DateTime _exitTime = DateTime.now().add(const Duration(minutes: 5));
  DateTime _returnTime = DateTime.now().add(const Duration(hours: 4));

  // Dashboard & History State
  List<dynamic> _exitLogs = [];
  bool _loadingLogs = false;
  String _currentStatus = "ON CAMPUS";
  bool _isScannerProcessing = false;

  @override
  void initState() {
    super.initState();
    _refreshDashboardData();
  }

  @override
  void dispose() {
    _scannerController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  // Fetch live logs and compute student status
  Future<void> _refreshDashboardData() async {
    setState(() {
      _loadingLogs = true;
    });
    final res = await _apiService.fetchExitLogs();
    if (res['success']) {
      setState(() {
        _exitLogs = res['exitLogs'] ?? [];
        if (_exitLogs.isNotEmpty) {
          final latestLog = _exitLogs.first;
          _currentStatus = latestLog['log_type'] == 'EXIT' ? 'OFF CAMPUS' : 'ON CAMPUS';
        } else {
          _currentStatus = (widget.studentData['status'] == 'ACTIVE')
              ? 'ON CAMPUS'
              : 'OFF CAMPUS';
        }
        _loadingLogs = false;
      });
    } else {
      setState(() {
        _loadingLogs = false;
      });
    }
  }

  // Handle bottom tab selection
  void _onTabTapped(int index) {
    if (index == 1) {
      _scannerController.start();
    } else if (_currentIndex == 1) {
      _scannerController.stop();
    }
    setState(() {
      _currentIndex = index;
    });
  }

  // Helper: Format DateTime string to human readable format
  String _formatDateTime(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final dt = DateTime.parse(dateStr).toLocal();
      final now = DateTime.now();
      final difference = now.difference(dt);
      
      String timeStr = "${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}";
      
      if (difference.inDays == 0 && dt.day == now.day) {
        return "Today, $timeStr";
      } else if (difference.inDays == 1 || (difference.inDays == 0 && dt.day == now.subtract(const Duration(days: 1)).day)) {
        return "Yesterday, $timeStr";
      } else {
        final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return "${months[dt.month - 1]} ${dt.day}, $timeStr";
      }
    } catch (_) {
      return dateStr;
    }
  }

  // Capitalize name derived from email prefix
  String get _studentName {
    final email = widget.studentData['email'] ?? 'Student';
    final prefix = email.split('@')[0];
    return prefix[0].toUpperCase() + prefix.substring(1);
  }

  // Student scans school QR code trigger
  void _onDetect(BarcodeCapture capture) async {
    if (_isScannerProcessing) return;
    
    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? qrToken = barcodes.first.rawValue;
    if (qrToken == null) return;

    setState(() {
      _isScannerProcessing = true;
    });
    
    _scannerController.stop();

    // Call student-scan validation API
    final res = await _apiService.studentScanQrCode(qrToken);

    if (mounted) {
      _showScanResultDialog(res);
    }
  }

  // Display result modal after scanning school QR code
  void _showScanResultDialog(Map<String, dynamic> result) {
    final success = result['success'] == true;
    final title = success ? 'Access Granted' : 'Access Denied';
    final color = success ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    final icon = success ? Icons.check_circle_rounded : Icons.cancel_rounded;
    
    String message = '';
    if (success) {
      final details = result['details'];
      message = 'Check-in/out successful.\n\nType: ${details['logType'] == 'EXIT' ? 'PHYSICAL EXIT' : 'PHYSICAL ENTRY'}\nTime: ${_formatDateTime(details['loggedAt'])}';
    } else {
      message = result['error'] ?? 'Failed to verify school checkpoint QR code.';
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF15181E),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20), 
          side: BorderSide(color: color.withOpacity(0.4), width: 1.5)
        ),
        title: Row(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(width: 10),
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        content: Text(
          message,
          style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.5),
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() {
                _isScannerProcessing = false;
              });
              // Refresh logs and return home tab
              _refreshDashboardData();
              _onTabTapped(0);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Back to Home', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
          )
        ],
      ),
    );
  }

  // Request leave pass input modal
  void _requestLeaveDialog() {
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF15181E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Color(0xFF232936))),
          title: const Text('Request Leave Pass', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _reasonController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Reason for leave',
                  labelStyle: TextStyle(color: Colors.grey),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366F1))),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Exit Window:', style: TextStyle(color: Colors.grey)),
                  TextButton(
                    onPressed: () async {
                      final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
                      if (time != null) {
                        setDialogState(() {
                          final now = DateTime.now();
                          _exitTime = DateTime(now.year, now.month, now.day, time.hour, time.minute);
                        });
                      }
                    },
                    child: Text('${_exitTime.hour}:${_exitTime.minute.toString().padLeft(2, '0')}', style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Return Window:', style: TextStyle(color: Colors.grey)),
                  TextButton(
                    onPressed: () async {
                      final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
                      if (time != null) {
                        setDialogState(() {
                          final now = DateTime.now();
                          _returnTime = DateTime(now.year, now.month, now.day, time.hour, time.minute);
                        });
                      }
                    },
                    child: Text('${_returnTime.hour}:${_returnTime.minute.toString().padLeft(2, '0')}', style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              onPressed: () async {
                final res = await _apiService.requestLeave(_reasonController.text.trim(), _exitTime, _returnTime);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(res['success'] 
                      ? 'Request submitted successfully!' 
                      : 'Error: ${res['error']}')
                  ),
                );
                _reasonController.clear();
                _refreshDashboardData();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text('Submit', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  // RENDER HOME PAGE CONTENT
  Widget _buildHomeTab(BuildContext context, LocationService locationService, Color trackingColor, String complianceStatus, Color primaryColor, Color cardBg, Color borderCol) {
    // Get latest activity log
    Map<String, dynamic>? lastLog = _exitLogs.isNotEmpty ? _exitLogs.first : null;
    String lastActivityText = "No previous scans logged.";
    if (lastLog != null) {
      final type = lastLog['log_type'] == 'EXIT' ? 'Checked Out' : 'Checked In';
      final formattedTime = _formatDateTime(lastLog['logged_at']);
      lastActivityText = "$type: $formattedTime";
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. DYNAMIC PROFILE & GREETING HEADER
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Hello,", style: TextStyle(color: Colors.grey[400], fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(_studentName, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                  const SizedBox(height: 4),
                  Text(widget.studentData['className'] ?? 'N/A', style: const TextStyle(color: Color(0xFF6366F1), fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6366F1), Color(0xFF4F46E5)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: borderCol, width: 1.5),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 4)),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(
                  _studentName.substring(0, 2).toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),

          // 2. CURRENT STATUS BANNER
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: _currentStatus == "ON CAMPUS" ? const Color(0xFF10B981).withOpacity(0.08) : const Color(0xFFEF4444).withOpacity(0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _currentStatus == "ON CAMPUS" ? const Color(0xFF10B981).withOpacity(0.2) : const Color(0xFFEF4444).withOpacity(0.2), 
                width: 1
              ),
            ),
            child: Row(
              children: [
                Icon(
                  _currentStatus == "ON CAMPUS" ? Icons.school_rounded : Icons.home_work_rounded,
                  color: _currentStatus == "ON CAMPUS" ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Currently: $_currentStatus",
                        style: TextStyle(
                          color: _currentStatus == "ON CAMPUS" ? const Color(0xFF10B981) : const Color(0xFFEF4444), 
                          fontWeight: FontWeight.bold, 
                          fontSize: 13
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _currentStatus == "ON CAMPUS" ? "Inside school parameters" : "Outside school premises",
                        style: TextStyle(color: Colors.grey[400], fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 3. GEOFENCING STATUS CONTAINER
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderCol, width: 1.2),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('GPS Stream Status', style: TextStyle(color: Colors.grey, fontSize: 12)),
                        SizedBox(height: 4),
                        Text('Real-time Geofence Tracking', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    Switch(
                      value: locationService.isTracking,
                      activeColor: primaryColor,
                      onChanged: (val) {
                        if (val) {
                          locationService.startTracking().catchError((e) {
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                          });
                        } else {
                          locationService.stopTracking();
                        }
                      },
                    )
                  ],
                ),
                const Divider(color: borderCol, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Zone Compliance:', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: trackingColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: trackingColor.withOpacity(0.3)),
                      ),
                      child: Text(
                        complianceStatus,
                        style: TextStyle(color: trackingColor, fontSize: 11, fontWeight: FontWeight.w800),
                      ),
                    )
                  ],
                ),
                if (locationService.currentPosition != null) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Coords: ${locationService.currentPosition!.latitude.toStringAsFixed(5)}, ${locationService.currentPosition!.longitude.toStringAsFixed(5)}',
                      style: const TextStyle(color: Colors.grey, fontSize: 10, fontFamily: 'monospace'),
                    ),
                  ),
                ]
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 4. QR CODE VIEWFINDER CARD (SCAN TRIGGER)
          GestureDetector(
            onTap: () => _onTabTapped(1),
            child: Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1B1F28), Color(0xFF15181E)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: borderCol, width: 1.2),
              ),
              child: Column(
                children: [
                  const Text('Scan School QR Code', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 4),
                  Text('Perform Entry check-in or Exit checkout', style: TextStyle(color: Colors.grey[400], fontSize: 11)),
                  const SizedBox(height: 22),
                  Container(
                    height: 140,
                    width: 140,
                    decoration: BoxDecoration(
                      color: const Color(0xFF0D0F12),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: primaryColor.withOpacity(0.3), width: 1),
                    ),
                    alignment: Alignment.center,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.qr_code_scanner_rounded, color: primaryColor, size: 48),
                        const SizedBox(height: 8),
                        Text(
                          'TAP TO SCAN',
                          style: TextStyle(color: primaryColor, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Align school QR code to check in/out',
                    style: TextStyle(color: Colors.grey[500], fontSize: 11, fontStyle: FontStyle.italic),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // 5. RECENT ACTIVITY CARD
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: borderCol, width: 1.2),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1B1F28),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.history_rounded, color: Colors.grey, size: 18),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Recent Activity", style: TextStyle(color: Colors.grey, fontSize: 11, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(lastActivityText, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 6. APPLY FOR LEAVE PASS BUTTON
          ElevatedButton.icon(
            onPressed: _requestLeaveDialog,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF232936),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: borderCol, width: 1),
              ),
              elevation: 0,
            ),
            icon: const Icon(Icons.note_add_rounded, size: 18, color: Color(0xFF6366F1)),
            label: const Text('Apply for Leave Pass', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  // RENDER CAMERA VIEWSCAN TAB
  Widget _buildScanTab() {
    return Stack(
      children: [
        MobileScanner(
          controller: _scannerController,
          onDetect: _onDetect,
        ),

        // Scanning Reticle overlay
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: _isScannerProcessing ? Colors.orange : const Color(0xFF6366F1), width: 3),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: EdgeInsets.only(top: 10.0),
                child: Text(
                  'ALIGN SCHOOL QR HERE',
                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.5),
                ),
              ),
            ),
          ),
        ),

        Positioned(
          top: 30,
          left: 20,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.6),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                const SizedBox(
                  width: 8,
                  height: 8,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.green),
                ),
                const SizedBox(width: 8),
                Text(
                  _isScannerProcessing ? "Processing scan..." : "Camera active",
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // RENDER HISTORY TAB
  Widget _buildHistoryTab(Color cardBg, Color borderCol) {
    if (_loadingLogs && _exitLogs.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    }

    if (_exitLogs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history_rounded, size: 48, color: Colors.grey[600]),
            const SizedBox(height: 12),
            Text("No scan records found", style: TextStyle(color: Colors.grey[400], fontSize: 14)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _refreshDashboardData,
      color: const Color(0xFF6366F1),
      child: ListView.builder(
        padding: const EdgeInsets.all(20.0),
        itemCount: _exitLogs.length,
        itemBuilder: (context, index) {
          final log = _exitLogs[index];
          final isExit = log['log_type'] == 'EXIT';
          final actionColor = isExit ? const Color(0xFFEF4444) : const Color(0xFF10B981);
          final actionIcon = isExit ? Icons.arrow_outward_rounded : Icons.login_rounded;
          final title = isExit ? "Physical Exit (Checked Out)" : "Physical Entry (Checked In)";
          
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderCol, width: 1),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: actionColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(actionIcon, color: actionColor, size: 20),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text("Time: ${_formatDateTime(log['logged_at'])}", style: TextStyle(color: Colors.grey[400], fontSize: 11)),
                      if (log['leave_reason'] != null) ...[
                        const SizedBox(height: 4),
                        Text("Reason: ${log['leave_reason']}", style: const TextStyle(color: Color(0xFF6366F1), fontSize: 11, fontStyle: FontStyle.italic)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  // RENDER PROFILE TAB
  Widget _buildProfileTab(Color cardBg, Color borderCol) {
    final email = widget.studentData['email'] ?? 'student@gmail.com';
    final rollNumber = widget.studentData['rollNumber'] ?? 'STD-XXX';
    final className = widget.studentData['className'] ?? 'Grade N/A';
    final phone = widget.studentData['phone'] ?? 'N/A';
    final parentPhone = widget.studentData['parentPhone'] ?? 'N/A';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Profile Avatar details card
          Center(
            child: Column(
              children: [
                const SizedBox(height: 10),
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF4F46E5)]),
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.2), blurRadius: 16, offset: const Offset(0, 6)),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: Text(_studentName.substring(0, 2).toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 26)),
                ),
                const SizedBox(height: 14),
                Text(_studentName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text("Role: STUDENT", style: TextStyle(color: Colors.grey[500], fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Detail Section
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderCol, width: 1),
            ),
            child: Column(
              children: [
                _buildProfileDetailRow(Icons.email_outlined, "Email Address", email),
                const Divider(color: Color(0xFF232936), height: 24),
                _buildProfileDetailRow(Icons.badge_outlined, "Roll Number", rollNumber),
                const Divider(color: Color(0xFF232936), height: 24),
                _buildProfileDetailRow(Icons.school_outlined, "Class / Grade", className),
                const Divider(color: Color(0xFF232936), height: 24),
                _buildProfileDetailRow(Icons.phone_android_outlined, "Student Phone", phone),
                const Divider(color: Color(0xFF232936), height: 24),
                _buildProfileDetailRow(Icons.family_restroom_outlined, "Parent Phone", parentPhone),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // Logout Action
          ElevatedButton(
            onPressed: () async {
              // Stop tracking and logout
              final locationService = Provider.of<LocationService>(context, listen: false);
              await locationService.stopTracking();
              await _apiService.logout();
              if (mounted) {
                Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const LoginScreen()));
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444).withOpacity(0.1),
              foregroundColor: const Color(0xFFEF4444),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1),
              ),
              elevation: 0,
            ),
            child: const Text('Sign Out / Logout', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  // Profile detail row helper
  Widget _buildProfileDetailRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: Colors.grey[400], size: 20),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 11)),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF6366F1);
    const darkBg = Color(0xFF0D0F12);
    const cardBg = Color(0xFF15181E);
    const borderCol = Color(0xFF232936);

    // List of tab titles for AppBar
    final titles = ["Student Dashboard", "Scan School QR", "Activity History", "My Profile"];

    return ChangeNotifierProvider(
      create: (_) => LocationService(),
      child: Consumer<LocationService>(
        builder: (context, locationService, _) {
          
          Color trackingColor = Colors.grey;
          String complianceStatus = "STOPPED";
          
          if (locationService.isTracking) {
            if (locationService.geofenceStatus == "OUT_OF_BOUNDS") {
              trackingColor = const Color(0xFFEF4444);
              complianceStatus = "OUT OF BOUNDS";
            } else {
              trackingColor = const Color(0xFF10B981);
              complianceStatus = "SAFE";
            }
          }

          // Build current selected tab body
          Widget body;
          switch (_currentIndex) {
            case 0:
              body = _buildHomeTab(context, locationService, trackingColor, complianceStatus, primaryColor, cardBg, borderCol);
              break;
            case 1:
              body = _buildScanTab();
              break;
            case 2:
              body = _buildHistoryTab(cardBg, borderCol);
              break;
            case 3:
              body = _buildProfileTab(cardBg, borderCol);
              break;
            default:
              body = _buildHomeTab(context, locationService, trackingColor, complianceStatus, primaryColor, cardBg, borderCol);
          }

          return Scaffold(
            backgroundColor: darkBg,
            appBar: AppBar(
              backgroundColor: cardBg,
              title: Text(
                titles[_currentIndex], 
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)
              ),
              elevation: 0,
              actions: [
                if (_currentIndex == 0 || _currentIndex == 2)
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white70),
                    onPressed: _refreshDashboardData,
                  )
              ],
            ),
            body: body,
            
            // CUSTOM PREMIUM BOTTOM NAVIGATION BAR
            bottomNavigationBar: Container(
              height: 72,
              decoration: BoxDecoration(
                color: cardBg,
                border: const Border(
                  top: BorderSide(color: borderCol, width: 1.2),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  // Tab 0: Home
                  _buildBottomNavItem(0, Icons.home_rounded, "Home", primaryColor),
                  
                  // Tab 1: Prominent QR Scan Button
                  Expanded(
                    child: InkWell(
                      onTap: () => _onTabTapped(1),
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 8),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: _currentIndex == 1 
                                      ? [const Color(0xFF4F46E5), const Color(0xFF6366F1)] 
                                      : [const Color(0xFF6366F1), const Color(0xFF4F46E5)],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: primaryColor.withOpacity(0.3), 
                                    blurRadius: 8, 
                                    offset: const Offset(0, 3)
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.qr_code_scanner_rounded, 
                                color: Colors.white, 
                                size: 24
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Tab 2: History
                  _buildBottomNavItem(2, Icons.history_rounded, "History", primaryColor),

                  // Tab 3: Profile
                  _buildBottomNavItem(3, Icons.person_rounded, "Profile", primaryColor),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // Navigation Item Builder helper
  Widget _buildBottomNavItem(int index, IconData icon, String label, Color primaryColor) {
    final isSelected = _currentIndex == index;
    final itemColor = isSelected ? primaryColor : Colors.grey[500];

    return Expanded(
      child: InkWell(
        onTap: () => _onTabTapped(index),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: itemColor, size: 20),
            const SizedBox(height: 4),
            Text(
              label, 
              style: TextStyle(
                color: itemColor, 
                fontSize: 10, 
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500
              )
            ),
          ],
        ),
      ),
    );
  }
}
