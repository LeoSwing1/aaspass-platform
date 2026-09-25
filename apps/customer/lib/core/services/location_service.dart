import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';

class LocationResult {
  final Position? position;
  final String label;
  final bool needsSettings;
  final bool serviceEnabled;

  const LocationResult({
    required this.position,
    required this.label,
    required this.needsSettings,
    required this.serviceEnabled,
  });
}

class LocationService {
  final Geocoding _geocoding = Geocoding();
  Position? position;
  String? label;
  bool needsSettings = false;

  Future<LocationResult> locate() async {
    needsSettings = false;
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      return const LocationResult(
        position: null,
        label: 'Turn on location services',
        needsSettings: true,
        serviceEnabled: false,
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      needsSettings = true;
      return const LocationResult(
        position: null,
        label: 'Location access is blocked',
        needsSettings: true,
        serviceEnabled: true,
      );
    }
    if (permission == LocationPermission.denied) {
      return const LocationResult(
        position: null,
        label: 'Location permission denied',
        needsSettings: false,
        serviceEnabled: true,
      );
    }

    try {
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      position = current;
      label = await _reverseLabel(current);
      return LocationResult(
        position: current,
        label: label ?? 'Current location',
        needsSettings: false,
        serviceEnabled: true,
      );
    } catch (_) {
      return const LocationResult(
        position: null,
        label: 'Unable to detect location',
        needsSettings: false,
        serviceEnabled: true,
      );
    }
  }

  Future<String?> _reverseLabel(Position p) async {
    try {
      final List<Placemark> marks = await _geocoding.placemarkFromCoordinates(
        p.latitude,
        p.longitude,
      );
      if (marks.isEmpty) return null;
      final Placemark m = marks.first;
      final parts = <String?>[m.name, m.subLocality, m.locality]
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet()
          .toList();
      return parts.isEmpty ? null : parts.take(3).join(', ');
    } catch (_) {
      return null;
    }
  }

  Future<bool> openSettings() => Geolocator.openAppSettings();
  Future<bool> openLocationSettings() => Geolocator.openLocationSettings();
}
