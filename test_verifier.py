import os
import json
import yaml

def print_result(name, success, message=""):
    status = "PASS" if success else "FAIL"
    print(f"[{status}] {name}: {message}")

def verify_workspace():
    print("==================================================")
    print("       WORKSPACE CODE VERIFICATION SUITE         ")
    print("==================================================")

    root_dir = "c:/Users/sovannak/Desktop/DUC"
    
    # 1. Verify Node.js Backend Setup
    backend_path = os.path.join(root_dir, "backend")
    if os.path.exists(backend_path):
        # Check package.json
        pkg_json_path = os.path.join(backend_path, "package.json")
        if os.path.exists(pkg_json_path):
            try:
                with open(pkg_json_path, 'r') as f:
                    data = json.load(f)
                print_result("Backend package.json", True, f"Found dependencies: {list(data.get('dependencies', {}).keys())}")
            except Exception as e:
                print_result("Backend package.json", False, f"Failed to parse JSON: {e}")
        else:
            print_result("Backend package.json", False, "Missing package.json")

        # Check DB Schema
        schema_path = os.path.join(backend_path, "src", "db", "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path, 'r') as f:
                content = f.read()
            has_postgis = "postgis" in content and "GEOMETRY" in content
            print_result("Database SQL Schema", has_postgis, "PostGIS spatial types detected." if has_postgis else "Missing PostGIS definitions.")
        else:
            print_result("Database SQL Schema", False, "Missing schema.sql")

        # Check PostGIS containing queries
        gf_service_path = os.path.join(backend_path, "src", "services", "geofenceService.ts")
        if os.path.exists(gf_service_path):
            with open(gf_service_path, 'r') as f:
                content = f.read()
            has_st_contains = "ST_Contains" in content and "ST_Point" in content
            print_result("PostGIS ST_Contains Logic", has_st_contains, "Spatial verification function found." if has_st_contains else "Missing ST_Contains calculation.")
        else:
            print_result("PostGIS ST_Contains Logic", False, "Missing geofenceService.ts")

        # Check Short-Lived Dynamic QR Expire limit
        permission_path = os.path.join(backend_path, "src", "controllers", "permission.ts")
        if os.path.exists(permission_path):
            with open(permission_path, 'r') as f:
                content = f.read()
            has_short_expiry = "expiresIn: '30s'" in content
            print_result("Dynamic QR Pass Expiry", has_short_expiry, "Short-lived 30s JWT expiry signature found." if has_short_expiry else "Missing 30s dynamic expiry.")
        else:
            print_result("Dynamic QR Pass Expiry", False, "Missing permission.ts")
    else:
        print_result("Backend Setup", False, "Missing backend directory")

    # 2. Verify Admin Web Dashboard
    dashboard_path = os.path.join(root_dir, "admin-dashboard")
    if os.path.exists(dashboard_path):
        pkg_json_path = os.path.join(dashboard_path, "package.json")
        if os.path.exists(pkg_json_path):
            try:
                with open(pkg_json_path, 'r') as f:
                    data = json.load(f)
                print_result("Dashboard package.json", True, "Successfully parsed Next.js configurations.")
            except Exception as e:
                print_result("Dashboard package.json", False, f"Failed to parse JSON: {e}")
        else:
            print_result("Dashboard package.json", False, "Missing package.json")

        # Check Leaflet Maps Component
        map_comp_path = os.path.join(dashboard_path, "src", "components", "MapComponent.tsx")
        if os.path.exists(map_comp_path):
            with open(map_comp_path, 'r') as f:
                content = f.read()
            has_leaflet = "leaflet" in content.lower() and "polygon" in content.lower()
            print_result("Dashboard Map Component", has_leaflet, "Leaflet mapping integration verified." if has_leaflet else "Map drawing missing.")
        else:
            print_result("Dashboard Map Component", False, "Missing MapComponent.tsx")
    else:
        print_result("Admin Dashboard Setup", False, "Missing admin-dashboard directory")

    # 3. Verify Flutter Mobile App
    mobile_path = os.path.join(root_dir, "mobile-app")
    if os.path.exists(mobile_path):
        pubspec_path = os.path.join(mobile_path, "pubspec.yaml")
        if os.path.exists(pubspec_path):
            try:
                # Custom parse or simple read for pubspec yaml
                with open(pubspec_path, 'r') as f:
                    pubspec_content = f.read()
                has_dependencies = "geolocator" in pubspec_content and "qr_flutter" in pubspec_content and "mobile_scanner" in pubspec_content
                print_result("Flutter pubspec.yaml", has_dependencies, "All required SDK components specified." if has_dependencies else "Missing key packages.")
            except Exception as e:
                print_result("Flutter pubspec.yaml", False, f"Failed to load: {e}")
        else:
            print_result("Flutter pubspec.yaml", False, "Missing pubspec.yaml")
    else:
        print_result("Mobile App Setup", False, "Missing mobile-app directory")

    print("==================================================")

if __name__ == "__main__":
    verify_workspace()
