{
  description = "TUI for browsing Erwin Brandstetter's Stack Overflow Q&A";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    rust-overlay.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, rust-overlay }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.rustPlatform.buildRustPackage {
            pname = "erwindb";
            version = "0.9.0";
            src = ./.;
            cargoLock.lockFile = ./Cargo.lock;

            nativeBuildInputs = [ pkgs.pkg-config ];
            buildInputs = [ pkgs.openssl pkgs.onnxruntime ]
              ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
                pkgs.darwin.apple_sdk.frameworks.Security
                pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
              ];

            env.ORT_LIB_LOCATION = "${pkgs.onnxruntime}";

            meta = {
              description = "TUI for browsing Erwin Brandstetter's Stack Overflow Q&A";
              homepage = "https://github.com/ahacop/erwindb";
              license = pkgs.lib.licenses.gpl3Plus;
              mainProgram = "erwindb";
            };
          };
        });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };
          rust = pkgs.rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" "rust-analyzer" ];
          };
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              rust
              pkgs.rustup
              pkgs.cargo-watch
              pkgs.cargo-edit
              pkgs.cargo-dist
              pkgs.deno
              pkgs.just
              pkgs.pkg-config
              pkgs.openssl
              pkgs.stdenv.cc.cc.lib
            ];

            RUST_BACKTRACE = 1;
            LD_LIBRARY_PATH = "${pkgs.stdenv.cc.cc.lib}/lib";
            OPENSSL_DIR = pkgs.openssl.dev;
            OPENSSL_LIB_DIR = "${pkgs.openssl.out}/lib";
            OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";
          };
        });
    };
}
