{
  pkgs ? import <nixpkgs> { },
}:
let
  runtimeLibs =
    with pkgs;
    (lib.makeLibraryPath [
      stdenv.cc.cc.lib
      glib
      zlib
      libGL
      libxcb
    ]);
in
pkgs.mkShell {
  packages = with pkgs; [
    python313
    gnumake
  ];

  shellHook = ''
    export LD_LIBRARY_PATH="${runtimeLibs}:''${LD_LIBRARY_PATH:-}"
  '';
}
