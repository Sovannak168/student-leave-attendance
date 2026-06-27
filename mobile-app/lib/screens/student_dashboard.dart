import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
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
  
  // Leave Form Controllers
  final _reasonController = TextEditingController();
  DateTime _exitTime = DateTime.now().add(const Duration(minutes: 5));
  DateTime _returnTime = DateTime.now().add(const Duration(hours: 4));

  // QR Refresh Timer State
  String? _qrToken;
  String? _qrError;
  Timer? _qrRefreshTimer;
  int _secondsRemaining = 30;

  @override
  void initState() {
    super.initState();
    // Start automatic QR checking
    _fetchAndScheduleQrRefresh();
  }

  @override
  void dispose() {
    _qrRefreshTimer?.cancel();
    _reasonController.dispose();
    super.dispose();
  }

  void _fetchAndScheduleQrRefresh() async {
    _qrRefreshTimer?.cancel();
    
    final qrRes = await _apiService.fetchActiveQrCode();
    if (qrRes['success']) {
      setState(() {
        _qrToken = qrRes['qrToken'];
        _qrError = null;
        _secondsRemaining = 30;
      });

      // Start Countdown and Schedule Refresh
      _qrRefreshTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (_secondsRemaining > 1) {
          setState(() {
            _secondsRemaining--;
          });
        } else {
          // Token expired, refresh
          _fetchAndScheduleQrRefresh();
        }
      });
    } else {
      setState(() {
        _qrToken = null;
        _qrError = qrRes['error'];
      });
      // Retry every 15 seconds if no active approved leave is found
      _qrRefreshTimer = Timer(const Duration(seconds: 15), () {
        _fetchAndScheduleQrRefresh();
      });
    }
  }

  void _requestLeaveDialog() {
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF15181E),
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
                    child: Text('${_exitTime.hour}:${_exitTime.minute.toString().padLeft(2, '0')}', style: const TextStyle(color: Color(0xFF6366F1))),
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
                    child: Text('${_returnTime.hour}:${_returnTime.minute.toString().padLeft(2, '0')}', style: const TextStyle(color: Color(0xFF6366F1))),
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
                _fetchAndScheduleQrRefresh();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF6366F1);
    const darkBg = Color(0xFF0D0F12);
    const cardBg = Color(0xFF15181E);
    const borderCol = Color(0xFF232936);

    return ChangeNotifierProvider(
      create: (_) => LocationService(),
      child: Consumer<LocationService>(
        builder: (context, locationService, _) {
          
          Color trackingColor = Colors.grey;
          String complianceStatus = "STOPPED";
          
          if (locationService.isTracking) {
            if (locationService.geofenceStatus == "OUT_OF_BOUNDS") {
              trackingColor = Colors.red;
              complianceStatus = "OUT OF BOUNDS";
            } else {
              trackingColor = Colors.green;
              complianceStatus = "SAFE";
            }
          }

          return Scaffold(
            backgroundColor: darkBg,
            appBar: AppBar(
              backgroundColor: cardBg,
              title: const Text('Student Dashboard', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              actions: [
                IconButton(
                  icon: const Icon(Icons.logout, color: Colors.redAccent),
                  onPressed: () async {
                    await locationService.stopTracking();
                    await _apiService.logout();
                    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const LoginScreen()));
                  },
                )
              ],
            ),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  
                  // 1. GEOFENCING STATUS CONTAINER
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderCol, width: 1),
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
                                Text('Real-time Geofence Tracking', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
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
                          const SizedBox(height: 8),
                          Text(
                            'Coords: ${locationService.currentPosition!.latitude.toStringAsFixed(5)}, ${locationService.currentPosition!.longitude.toStringAsFixed(5)}',
                            style: const TextStyle(color: Colors.grey, fontSize: 10, fontFamily: 'monospace'),
                            textAlign: TextAlign.left,
                          ),
                        ]
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // 2. DYNAMIC QR DISPLAY PASS
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderCol, width: 1),
                    ),
                    child: Column(
                      children: [
                        const Text('Gate Access Pass', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 4),
                        const Text('Presents to guards at physical entries/exits', style: TextStyle(color: Colors.grey, fontSize: 11)),
                        const SizedBox(height: 20),

                        if (_qrToken != null) ...[
                          Container(
                            color: Colors.white,
                            padding: const EdgeInsets.all(12),
                            child: QrImageView(
                              data: _qrToken!,
                              version: QrVersions.auto,
                              size: 180.0,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'QR regenerates in: $_secondsRemaining seconds',
                            style: const TextStyle(color: primaryColor, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ] else ...[
                          Container(
                            height: 180,
                            width: 180,
                            color: const Color(0xFF1B1F28),
                            alignment: Alignment.center,
                            child: const Icon(Icons.qr_code_2, color: Colors.grey, size: 64),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _qrError ?? 'Checking active approved leave...',
                            style: const TextStyle(color: Colors.grey, fontSize: 11),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // 3. ACTION CONTROLS
                  ElevatedButton.icon(
                    onPressed: _requestLeaveDialog,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF232936),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    icon: const Icon(Icons.note_add, size: 18),
                    label: const Text('Apply for Leave Pass', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  ),

                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
