import io
import re
import zipfile
from datetime import timedelta
from urllib.request import Request, urlopen

import pandas as pd
import numpy as np
import requests
from my_project.utils import code_timer
from pvlib import solarposition
from pythermalcomfort.models import utci
from pythermalcomfort.models import solar_gain as sgain
from pythermalcomfort import psychrometrics as psy
import math
from my_project.global_scheme import month_lst


@code_timer
def get_data(source_url):
    """Return a list of the data from api call."""
    if source_url[-3:] == "zip" or source_url[-3:] == "all":
        request = requests.get(source_url)
        if request.status_code != 404:
            zf = zipfile.ZipFile(io.BytesIO(request.content))
            for i in zf.namelist():
                if i[-3:] == "epw":
                    epw_name = i
                    data = zf.read(epw_name)
                    data = repr(data).split("\\n")
                    return data
        else:
            print("returning none")
            return None
    else:
        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            req = Request(source_url, headers=headers)
            epw = urlopen(req).read().decode()
            return epw.split("\n")
        except:
            return None


@code_timer
def create_df(lst, file_name):
    """Extract and clean the data. Return a pandas data from a url."""
    meta = lst[0].strip().replace("\\r", "").split(",")

    location_info = {
        "url": file_name,
        "lat": float(meta[-4]),
        "lon": float(meta[-3]),
        "time_zone": float(meta[-2]),
        "site_elevation": meta[-1],
        "city": meta[1],
        "state": meta[2],
        "country": meta[3],
        "period": None,
    }

    # from OneClimaBuilding files extract info about reference years
    try:
        location_info["period"] = re.search(r'cord=[\'"]?([^\'" >]+);', lst[5]).group(1)
    except AttributeError:
        pass

    lst = lst[8:8768]
    lst = [line.strip().split(",") for line in lst]

    # Each data row exclude index 4 and 5, and everything after days now
    for line in lst:
        del line[4:6]
        del line[9]
        del line[-1]
        del line[-1]
        del line[-1]

    col_names = [
        "year",
        "month",
        "day",
        "hour",
        "DBT",
        "DPT",
        "RH",
        "p_atm",
        "extr_hor_rad",
        "hor_ir_rad",
        "glob_hor_rad",
        "dir_nor_rad",
        "dif_hor_rad",
        "glob_hor_ill",
        "dir_nor_ill",
        "dif_hor_ill",
        "Zlumi",
        "wind_dir",
        "wind_speed",
        "tot_sky_cover",
        "Oskycover",
        "Vis",
        "Cheight",
        "PWobs",
        "PWcodes",
        "Pwater",
        "AsolOptD",
        "SnowD",
        "DaySSnow",
    ]

    # assign column names and if fewer cols are there than supposed assign 9999 to that col
    if len(lst[0]) < len(col_names):
        epw_df = pd.DataFrame(columns=col_names[: len(lst[0])], data=lst)
        for col in [x for ix, x in enumerate(col_names) if ix >= len(lst[0])]:
            epw_df[col] = 9999
    else:
        epw_df = pd.DataFrame(columns=col_names, data=lst)

    # from EnergyPlus files extract info about reference years
    if not location_info["period"]:
        years = epw_df["year"].astype("int").unique()
        if len(years) == 1:
            year_rounded_up = int(math.ceil(years[0] / 10.0)) * 10
            location_info["period"] = f"{year_rounded_up-10}-{year_rounded_up}"
        else:
            min_year = int(math.floor(min(years) / 10.0)) * 10
            max_year = int(math.ceil(max(years) / 10.0)) * 10
            location_info["period"] = f"{min_year}-{max_year}"

    # Add fake_year
    epw_df["fake_year"] = "year"

    # Add in month names
    month_look_up = {ix + 1: month for ix, month in enumerate(month_lst)}
    epw_df["month_names"] = epw_df["month"].astype("int").map(month_look_up)

    # Add in DOY
    epw_df["DOY"] = pd.to_datetime(
        (
            epw_df["year"].astype(int) * 10000
            + epw_df["month"].astype(int) * 100
            + epw_df["day"].astype(int)
        ).apply(str),
        format="%Y%m%d",
    ).dt.dayofyear

    # Change to int type
    change_to_int = ["year", "day", "month", "hour"]
    for col in change_to_int:
        epw_df[col] = epw_df[col].astype(int)

    change_to_float = [
        "DBT",
        "DPT",
        "RH",
        "p_atm",
        "extr_hor_rad",
        "hor_ir_rad",
        "glob_hor_rad",
        "dir_nor_rad",
        "dif_hor_rad",
        "glob_hor_ill",
        "dir_nor_ill",
        "dif_hor_ill",
        "Zlumi",
        "wind_dir",
        "wind_speed",
        "tot_sky_cover",
        "Oskycover",
        "Vis",
        "Cheight",
        "PWobs",
        "PWcodes",
        "Pwater",
        "AsolOptD",
        "SnowD",
        "DaySSnow",
    ]
    for col in change_to_float:
        epw_df[col] = epw_df[col].astype(float)

    # Add in times df
    times = pd.date_range(
        "2019-01-01 00:00:00", "2020-01-01", closed="left", freq="H", tz="UTC"
    )
    epw_df["UTC_time"] = pd.to_datetime(times)
    delta = timedelta(days=0, hours=location_info["time_zone"] - 1, minutes=0)
    times = times - delta
    epw_df["times"] = times
    epw_df.set_index(
        "times", drop=False, append=False, inplace=True, verify_integrity=False
    )

    # Add in solar position df
    solar_position = solarposition.get_solarposition(
        times, location_info["lat"], location_info["lon"]
    )
    epw_df = pd.concat([epw_df, solar_position], axis=1)

    # Add in UTCI
    sol_altitude = epw_df["elevation"].mask(epw_df["elevation"] <= 0, 0)
    sharp = [45] * 8760
    sol_radiation_dir = epw_df["dir_nor_rad"]
    sol_transmittance = [1] * 8760  # CHECK VALUE
    f_svv = [1] * 8760  # CHECK VALUE
    f_bes = [1] * 8760  # CHECK VALUE
    asw = [0.7] * 8760  # CHECK VALUE
    posture = ["standing"] * 8760
    floor_reflectance = [0.6] * 8760  # EXPOSE AS A VARIABLE?

    mrt = np.vectorize(sgain)(
        sol_altitude,
        sharp,
        sol_radiation_dir,
        sol_transmittance,
        f_svv,
        f_bes,
        asw,
        posture,
        floor_reflectance,
    )
    mrt_df = pd.DataFrame.from_records(mrt)
    mrt_df["delta_mrt"] = mrt_df["delta_mrt"].mask(mrt_df["delta_mrt"] >= 70, 70)
    mrt_df = mrt_df.set_index(epw_df.times)

    epw_df = epw_df.join(mrt_df)

    epw_df["MRT"] = epw_df["delta_mrt"] + epw_df["DBT"]
    epw_df["wind_speed_utci"] = epw_df["wind_speed"]
    epw_df["wind_speed_utci"] = epw_df["wind_speed_utci"].mask(
        epw_df["wind_speed_utci"] >= 17, 16.9
    )
    epw_df["wind_speed_utci"] = epw_df["wind_speed_utci"].mask(
        epw_df["wind_speed_utci"] <= 0.5, 0.6
    )
    epw_df["wind_speed_utci_0"] = epw_df["wind_speed_utci"].mask(
        epw_df["wind_speed_utci"] >= 0, 0.5
    )
    epw_df["utci_noSun_Wind"] = np.vectorize(utci)(
        epw_df["DBT"], epw_df["DBT"], epw_df["wind_speed_utci"], epw_df["RH"]
    )
    epw_df["utci_noSun_noWind"] = np.vectorize(utci)(
        epw_df["DBT"], epw_df["DBT"], epw_df["wind_speed_utci_0"], epw_df["RH"]
    )
    epw_df["utci_Sun_Wind"] = np.vectorize(utci)(
        epw_df["DBT"], epw_df["MRT"], epw_df["wind_speed_utci"], epw_df["RH"]
    )
    epw_df["utci_Sun_noWind"] = np.vectorize(utci)(
        epw_df["DBT"], epw_df["MRT"], epw_df["wind_speed_utci_0"], epw_df["RH"]
    )

    utci_bins = [-999, -40, -27, -13, 0, 9, 26, 32, 38, 46, 999]
    utci_labels = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4]
    epw_df["utci_noSun_Wind_categories"] = pd.cut(
        x=epw_df["utci_noSun_Wind"], bins=utci_bins, labels=utci_labels
    )
    epw_df["utci_noSun_noWind_categories"] = pd.cut(
        x=epw_df["utci_noSun_noWind"], bins=utci_bins, labels=utci_labels
    )
    epw_df["utci_Sun_Wind_categories"] = pd.cut(
        x=epw_df["utci_Sun_Wind"], bins=utci_bins, labels=utci_labels
    )
    epw_df["utci_Sun_noWind_categories"] = pd.cut(
        x=epw_df["utci_Sun_noWind"], bins=utci_bins, labels=utci_labels
    )

    # Add psy values
    ta_rh = np.vectorize(psy.psy_ta_rh)(epw_df["DBT"], epw_df["RH"])
    psy_df = pd.DataFrame.from_records(ta_rh)
    psy_df = psy_df.set_index(epw_df.times)
    epw_df = epw_df.join(psy_df)

    return epw_df, location_info


if __name__ == "__main__":
    # fmt: off
    test_url = "https://www.energyplus.net/weather-download/europe_wmo_region_6/ITA//ITA_Bologna-Borgo.Panigale.161400_IGDG/all"
    other_url = "https://energyplus.net/weather-download/north_and_central_america_wmo_region_4/USA/CA/USA_CA_Oakland.Intl.AP.724930_TMY/USA_CA_Oakland.Intl.AP.724930_TMY.epw"
    # fmt: on

    # -----
    lines = get_data(source_url=test_url)
    df, location_data = create_df(lst=lines, file_name=test_url)
