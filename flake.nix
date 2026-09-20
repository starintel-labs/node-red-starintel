{
  description = "StarIntel Node-RED nodes: documents, datasets, actor manifests, and agentic starintel-rlm actors";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 ];
        };
      });

      packages = forAllSystems (pkgs: {
        palette = pkgs.stdenv.mkDerivation {
          pname = "node-red-starintel";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = self;
          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/node_modules/node-red-starintel
            cp -r . $out/lib/node_modules/node-red-starintel/
            rm -rf $out/lib/node_modules/node-red-starintel/.git
            runHook postInstall
          '';
        };
      });

      checks = forAllSystems (pkgs: {
        node-test = pkgs.runCommand "node-red-starintel-node-test"
          {
            nativeBuildInputs = [ pkgs.nodejs_22 ];
          }
          ''
            cp -r ${self} source
            chmod -R u+w source
            cd source
            node --test
            touch $out
          '';
      });
    };
}
