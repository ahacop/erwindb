{
  description = "ErwinDB - TUI for exploring Erwin Brandstetter's Stack Overflow answers";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
      };
    in {
      packages.default = pkgs.stdenv.mkDerivation {
        pname = "erwindb";
        version = "0.1.0";

        src = ./.;

        nativeBuildInputs = [
          pkgs.bun
          pkgs.curl
          pkgs.makeWrapper
        ];

        buildPhase = ''
          # Build the binary
          bun build --compile tui.tsx --outfile erwindb
        '';

        installPhase = ''
          mkdir -p $out/{bin,share/erwindb/{lib,models,data}}

          # Install binary
          cp erwindb $out/bin/

          # Copy sqlite-vec extension if available
          if [ -d "node_modules/sqlite-vec-linux-${if pkgs.stdenv.hostPlatform.isAarch64 then "arm64" else "x64"}" ]; then
            cp node_modules/sqlite-vec-linux-*/vec0.so $out/share/erwindb/lib/ 2>/dev/null || true
          fi

          # Copy database if available
          if [ -f "erwin_stackoverflow.db" ]; then
            cp erwin_stackoverflow.db $out/share/erwindb/data/
          fi

          # Download models (subdirectory structure required by transformers.js)
          MODEL_DIR=$out/share/erwindb/models/sentence-transformers/all-MiniLM-L6-v2
          mkdir -p $MODEL_DIR/onnx
          curl -sL "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/config.json" \
            -o $MODEL_DIR/config.json
          curl -sL "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json" \
            -o $MODEL_DIR/tokenizer.json
          curl -sL "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json" \
            -o $MODEL_DIR/tokenizer_config.json
          curl -sL "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/special_tokens_map.json" \
            -o $MODEL_DIR/special_tokens_map.json
          curl -sL "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx" \
            -o $MODEL_DIR/onnx/model.onnx
        '';

        # Wrap binary to set ERWINDB_HOME
        postFixup = ''
          wrapProgram $out/bin/erwindb \
            --set ERWINDB_HOME "$out/share/erwindb"
        '';

        meta = with pkgs.lib; {
          description = "TUI for exploring Erwin Brandstetter's Stack Overflow answers";
          homepage = "https://github.com/ahacop/erwindb";
          license = licenses.mit;
          platforms = platforms.unix;
        };
      };

      devShells.default = pkgs.mkShell {
        name = "erwindb-dev";
        buildInputs = [
          pkgs.nodejs_24
          pkgs.deno
          pkgs.bun
          pkgs.typescript
          pkgs.just
        ];
        shellHook = ''
          echo "✔ ErwinDB development environment ready."
        '';
      };
    });
}
