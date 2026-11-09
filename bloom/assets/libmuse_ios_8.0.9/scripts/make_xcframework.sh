#!/bin/sh
# Copyright 2024 Interaxon, Inc.
# Use this script to generate XCFramework files from the SDK archives.
# It can be used to combine iOS, Mac Catalyst and macOS.

set -o pipefail
set -e

all=""
loc=""
libname="libmuse"

usage="
$(basename "$0") -p <path> [-a all] [-h help]

Create an XCFramework from the SDK tar.gz archive files found at the given path.

    -p path of the directory containing the Muse SDK archives
    -a include all available libraries without prompting
    -h show this help text
"

while getopts "p:l:ah" opt;
do
    case $opt in
        p) loc="$OPTARG" ;;
        a) all="true" ;;
        l) libname="$OPTARG" ;; # -l library name (hidden option)
        h) echo "$usage"
            exit ;;
    esac
done

shift "$((OPTIND - 1))"

if [[ -z "$loc" ]]; then
    if [[ $# -eq 1 ]]; then
        loc=$1
    elif [[ $# -eq 0 ]]; then
        echo "Path not specified, using current directory"
        loc=""
    else
        echo "Specify archive path with -p"
        exit 1
    fi
fi

if [[ "$loc" == "." ]]; then
    loc=""
fi

if [[ "$loc" == "${loc#/}" ]]; then
    if [[ "$loc" == "" ]]; then
        loc="$(pwd)"
    else
        loc="$(pwd)/$loc"
    fi
fi

xcf="$loc/xcf"

if [[ "$xcf" == *" "* ]]; then
    echo Error in path "$xcf"
    echo "xcodebuild doesn't support paths containing spaces. Move to a location with no spaces in the path."
    exit 1
fi

function include_option {
    local option="$1"
    read -p "Include $option? (y/N): " answer
    if [[ $answer =~ ^[Yy]$ ]]; then
        echo "true"
    fi
}

function extract_archive {
    mkdir -p "$xcf"
    xattr -c "$loc/$1" 
    tar -xf "$loc/$1" -C "$xcf"
}

function extract_frameworks {
    local dir="$xcf/$1"
    local src="$dir/Muse.framework/Muse"
    for cpu in $(lipo -archs "$src")
    do
        echo Extract $cpu from $1 
        if [[ -d "$dir/Muse.framework.$cpu" ]]; then
            rm -rf "$dir/Muse.framework.$cpu"
        fi
        cp -rf "$dir/Muse.framework" "$dir/Muse.framework.$cpu"
        lipo -thin $cpu "$src" -output "$dir/Muse.framework.$cpu/Muse.a"
        rm -f "$dir/Muse.framework.$cpu/Muse"
    done
}

function make_args {
    local lib=$1
    local arch=""
    if [[ -n "$2" ]]; then
        arch=".$2"
    fi
    echo "-library $xcf/$lib/Muse.framework$arch/Muse.a -headers $xcf/$lib/Muse.framework/Headers"
}

function fix_headers {
    local lib=$1
    mkdir "$xcf/$lib/Muse.framework/Headers/Muse"
    mv -f "$xcf/$lib/Muse.framework/Headers/api" "$xcf/$lib/Muse.framework/Headers/Muse/"
    local internal="$xcf/$lib/Muse.framework/Headers/internal"
    if [ -d "$internal" ]; then
        mv -f "$internal" "$xcf/$lib/Muse.framework/Headers/Muse/"
    fi
}

function delete_xcf {
    if [[ -d "$xcf" ]]; then
        rm -rf "$xcf"
    fi
}

archive=$(find "$loc" -name "${libname}_*.tar.gz" -type f -maxdepth 1 -exec basename {} \; | head -n 1)
if [[ $? -ne 0 || -z $archive ]]; then
    echo No $libname archive found in directory $loc
    echo Specify a location that contains the Muse SDK tar.gz archives. \(-h for help\)
    exit 1
fi

ver=$(echo "$archive" | awk -F'[_.]' '{print $3"."$4"."$5}')

if [[ -z "$ver" || "$ver" == ".." ]]; then
    echo "No $libname version number found"
    exit 1
fi

if [[ -z "$all" ]]; then
    clear
fi

echo "Found SDK archive(s) in $loc"

files=$(find "$loc" -name "${libname}_*_$ver.tar.gz" -type f -maxdepth 1 -exec basename {} \;)

add_ios=""
add_catalyst=""
add_macos=""

# find the available frameworks
for file in "${files[@]}"; do
    if [[ $file == *"ios"* ]]; then
        add_ios="true"
    fi
    if [[ $file == *"catalyst"* ]]; then
        add_catalyst="true"
    fi
    if [[ $file == *"macos"* ]]; then
        add_macos="true"
    fi
done

# allow user selection if 'all' option not specified
if [[ -z "$all" ]]; then
    echo Select the libraries you wish to include in the XCFramework
    if [[ $add_ios == "true" ]]; then
        add_ios=$(include_option "iOS")
    fi

    if [[ $add_catalyst == "true" ]]; then
        add_catalyst=$(include_option "Mac Catalyst")
    fi

    if [[ $add_macos == "true" ]]; then
        add_macos=$(include_option "macOS")
    fi
fi

if [[ $add_ios == "true" || $add_catalyst == "true" || $add_macos == "true" ]]; then
    echo Creating XCFramework for Muse SDK $ver
    delete_xcf
else
    echo "No libraries selected, nothing to do"
    exit 1
fi

args="-create-xcframework"

if [[ $add_ios == "true" ]]; then
    extract_archive "${libname}_ios_$ver.tar.gz"
    fix_headers "${libname}_ios_$ver"
    extract_frameworks "${libname}_ios_$ver"
    args="$args $(make_args ${libname}_ios_$ver arm64)"
    args="$args $(make_args ${libname}_ios_$ver x86_64)"
fi

if [[ $add_catalyst == "true" ]]; then
    extract_archive "${libname}_catalyst_$ver.tar.gz"
    fix_headers "${libname}_catalyst_$ver"
    echo Extract fat lib from ${libname}_catalyst_$ver
    mv -f "$xcf/${libname}_catalyst_$ver/Muse.framework/Muse" "$xcf/${libname}_catalyst_$ver/Muse.framework/Muse.a"
    args="$args $(make_args ${libname}_catalyst_$ver)"
fi

if [[ $add_macos == "true" ]]; then
    extract_archive "${libname}_macos_$ver.tar.gz"
    fix_headers "${libname}_macos_$ver"
    echo Extract fat lib from ${libname}_macos_$ver
    mv -f "$xcf/${libname}_macos_$ver/Muse.framework/Muse" "$xcf/${libname}_macos_$ver/Muse.framework/Muse.a"
    args="$args $(make_args ${libname}_macos_$ver)"
fi

xcf_out="$loc/Muse.xcframework"

if [[ -d "$xcf_out" ]]; then
    rm -rf "$xcf_out"
fi

xcodebuild $args -output "$xcf_out"
delete_xcf
