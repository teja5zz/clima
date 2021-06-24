from math import ceil, floor

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from pythermalcomfort.models import adaptive_ashrae
from pythermalcomfort.utilities import running_mean_outdoor_temperature

from my_project.global_scheme import color_dict, name_dict, range_dict, unit_dict
from my_project.utils import code_timer

from .global_scheme import month_lst, template, tight_margins


# violin template
def violin(df, var, global_local):
    """Return day night violin based on the 'var' col"""
    mask_day = (df["hour"] >= 8) & (df["hour"] < 20)
    mask_night = (df["hour"] < 8) | (df["hour"] >= 20)
    var_unit = str(var) + "_unit"
    var_unit = unit_dict[var_unit]
    var_range = str(var) + "_range"
    var_range = range_dict[var_range]
    var_name = str(var) + "_name"
    var_name = name_dict[var_name]

    data_day = df.loc[mask_day, var]
    data_night = df.loc[mask_night, var]

    fig = go.Figure()
    fig.add_trace(
        go.Violin(
            x=df["fake_year"],
            y=data_day,
            line_color="#ffaa00",
            name="Day",
            side="negative",
            hoverinfo="y",
            hoveron="violins",
        )
    )

    fig.add_trace(
        go.Violin(
            x=df["fake_year"],
            y=data_night,
            line_color="#00264d",
            name="Night",
            side="positive",
            hoverinfo="y",
            hoveron="violins",
        )
    )

    fig.update_yaxes(range=var_range)
    fig.update_traces(
        meanline_visible=True,
        orientation="v",
        width=0.8,
        points=False,
    )
    fig.update_layout(
        xaxis_showgrid=False,
        xaxis_zeroline=False,
        violingap=0,
        violingroupgap=0,
        violinmode="overlay",
        margin=tight_margins,
        legend=dict(orientation="h", yanchor="bottom", y=0.9, xanchor="right", x=1),
    )
    title = var_name + " (" + var_unit + ")"
    fig.update_layout(template=template, title=title, title_x=0.5, dragmode=False)
    fig.update_xaxes(showline=True, linewidth=1, linecolor="black", mirror=True)
    fig.update_yaxes(showline=True, linewidth=1, linecolor="black", mirror=True)

    return fig


# YEARLY PROFILE TEMPLATE
def get_ashrae(df):
    """calculate the ashrae for the yearly DBT. Helper function for yearly_profile"""
    dbt_day_ave = df.groupby(["DOY"])["DBT"].mean().reset_index()
    dbt_day_ave = dbt_day_ave["DBT"].tolist()
    n = 7
    cmf55 = []
    lo80 = []
    hi80 = []
    lo90 = []
    hi90 = []
    for i in range(len(dbt_day_ave)):
        if i < n:
            last_days = dbt_day_ave[-n + i :] + dbt_day_ave[0:i]
        else:
            last_days = dbt_day_ave[i - n : i]
        last_days.reverse()
        last_days = [10 if x <= 10 else x for x in last_days]
        last_days = [32 if x >= 32 else x for x in last_days]
        rmt = running_mean_outdoor_temperature(last_days, alpha=0.9)
        if dbt_day_ave[i] >= 40:
            dbt_day_ave[i] = 40
        elif dbt_day_ave[i] <= 10:
            dbt_day_ave[i] = 10
        r = adaptive_ashrae(
            tdb=dbt_day_ave[i], tr=dbt_day_ave[i], t_running_mean=rmt, v=0.5
        )
        cmf55.append(r["tmp_cmf"])
        lo80.append(r["tmp_cmf_80_low"])
        hi80.append(r["tmp_cmf_80_up"])
        lo90.append(r["tmp_cmf_90_low"])
        hi90.append(r["tmp_cmf_90_up"])
    return lo80, hi80, lo90, hi90


@code_timer
def yearly_profile(df, var, global_local):
    """Return yearly profile figure based on the 'var' col."""
    lo80, hi80, lo90, hi90 = get_ashrae(df)
    var_unit = unit_dict[str(var) + "_unit"]
    var_range = range_dict[str(var) + "_range"]
    var_name = name_dict[str(var) + "_name"]
    var_color = color_dict[str(var) + "_color"]
    if global_local == "global":
        # Set Global values for Max and minimum
        range_y = var_range
    else:
        # Set maximum and minimum according to data
        data_max = 5 * ceil(df[var].max() / 5)
        data_min = 5 * floor(df[var].min() / 5)
        range_y = [data_min, data_max]
    var_single_color = var_color[len(var_color) // 2]
    custom_xlim = [0, 365]
    custom_ylim = range_y
    days = [i for i in range(365)]
    # Get min, max, and mean of each day
    dbt_day = df.groupby(np.arange(len(df.index)) // 24)[var].agg(
        ["min", "max", "mean"]
    )
    trace1 = go.Bar(
        x=days,
        y=dbt_day["max"] - dbt_day["min"],
        base=dbt_day["min"],
        marker_color=var_single_color,
        marker_opacity=0.3,
        name=var_name + " Range",
        customdata=np.stack(
            (dbt_day["mean"], df.iloc[::24, :]["month_names"], df.iloc[::24, :]["day"]),
            axis=-1,
        ),
        hovertemplate=(
            "Max: %{y:.2f} "
            + var_unit
            + "<br>"
            + "Min: %{base:.2f} "
            + var_unit
            + "<br>"
            + "<b>Ave : %{customdata[0]:.2f} "
            + var_unit
            + "</b><br>"
            + "Month: %{customdata[1]}<br>"
            + "Day: %{customdata[2]}<br>"
        ),
    )

    trace2 = go.Scatter(
        x=days,
        y=dbt_day["mean"],
        name="Average " + var_name,
        mode="lines",
        marker_color=var_single_color,
        marker_opacity=1,
        customdata=np.stack(
            (dbt_day["mean"], df.iloc[::24, :]["month_names"], df.iloc[::24, :]["day"]),
            axis=-1,
        ),
        hovertemplate=(
            "<b>Ave : %{customdata[0]:.2f} "
            + var_unit
            + "</b><br>"
            + "Month: %{customdata[1]}<br>"
            + "Day: %{customdata[2]}<br>"
        ),
    )

    if var == "DBT":
        # plot ashrae adaptive comfort limits (80%)
        lo80_df = pd.DataFrame({"lo80": lo80})
        hi80_df = pd.DataFrame({"hi80": hi80})

        trace3 = go.Bar(
            x=days,
            y=hi80_df["hi80"] - lo80_df["lo80"],
            base=lo80_df["lo80"],
            name="ASHRAE adaptive comfort (80%)",
            marker_color="silver",
            marker_opacity=0.3,
            hovertemplate=(
                "Max: %{y:.2f} &#8451;<br>" + "Min: %{base:.2f} &#8451;<br>"
            ),
        )

        # plot ashrae adaptive comfort limits (90%)
        lo90_df = pd.DataFrame({"lo90": lo90})
        hi90_df = pd.DataFrame({"hi90": hi90})

        trace4 = go.Bar(
            x=days,
            y=hi90_df["hi90"] - lo90_df["lo90"],
            base=lo90_df["lo90"],
            name="ASHRAE adaptive comfort (90%)",
            marker_color="silver",
            marker_opacity=0.3,
            hovertemplate=(
                "Max: %{y:.2f} &#8451;<br>" + "Min: %{base:.2f} &#8451;<br>"
            ),
        )
        data = [trace3, trace4, trace1, trace2]

    elif var == "RH":
        # plot relative Humidity limits (30-70%)
        lo_rh = [30] * 365
        hi_rh = [70] * 365
        lo_rh_df = pd.DataFrame({"loRH": lo_rh})
        hi_rh_df = pd.DataFrame({"hiRH": hi_rh})

        trace3 = go.Bar(
            x=days,
            y=hi_rh_df["hiRH"] - lo_rh_df["loRH"],
            base=lo_rh_df["loRH"],
            name="humidity comfort band",
            marker_opacity=0.3,
            marker_color="silver",
        )

        data = [trace3, trace1, trace2]

    else:
        data = [trace1, trace2]

    layout = go.Layout(barmode="overlay", bargap=0, margin=tight_margins)

    fig = go.Figure(data=data, layout=layout)

    fig.update_xaxes(range=custom_xlim)
    fig.update_yaxes(range=custom_ylim)

    fig.update_layout(
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )

    fig.update_yaxes(title_text=var_unit)
    fig.update_xaxes(title_text="days of the year")

    fig.update_layout(template=template)
    fig.update_xaxes(showline=True, linewidth=1, linecolor="black", mirror=True)
    fig.update_yaxes(showline=True, linewidth=1, linecolor="black", mirror=True)
    return fig


@code_timer
def daily_profile(df, var, global_local):
    """Return the daily profile based on the 'var' col."""
    var_unit = unit_dict[str(var) + "_unit"]
    var_range = range_dict[str(var) + "_range"]
    var_name = name_dict[str(var) + "_name"]
    var_color = color_dict[str(var) + "_color"]
    if global_local == "global":
        # Set Global values for Max and minimum
        range_y = var_range
    else:
        # Set maximum and minimum according to data
        data_max = 5 * ceil(df[var].max() / 5)
        data_min = 5 * floor(df[var].min() / 5)
        range_y = [data_min, data_max]

    var_single_color = var_color[len(var_color) // 2]
    var_month_ave = df.groupby(["month", "hour"])[var].median().reset_index()
    month_list = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]
    fig = make_subplots(
        rows=1,
        cols=12,
        subplot_titles=(
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ),
    )

    for i in range(12):

        fig.add_trace(
            go.Scatter(
                x=df.loc[df["month"] == i + 1, "hour"],
                y=df.loc[df["month"] == i + 1, var],
                mode="markers",
                marker_color=var_single_color,
                opacity=0.5,
                marker_size=3,
                name=month_list[i],
                showlegend=False,
                customdata=df.loc[df["month"] == i + 1, "month_names"],
                hovertemplate=(
                    "<b>"
                    + var
                    + ": %{y:.2f} "
                    + var_unit
                    + "</b><br>"
                    + "Month: %{customdata}<br>"
                    + "Hour: %{x}:00<br>"
                ),
            ),
            row=1,
            col=i + 1,
        )

        fig.add_trace(
            go.Scatter(
                x=var_month_ave.loc[var_month_ave["month"] == i + 1, "hour"],
                y=var_month_ave.loc[var_month_ave["month"] == i + 1, var],
                mode="lines",
                line_color=var_single_color,
                line_width=3,
                name=None,
                showlegend=False,
                hovertemplate=(
                    "<b>"
                    + var
                    + ": %{y:.2f} "
                    + var_unit
                    + "</b><br>"
                    + "Hour: %{x}:00<br>"
                ),
            ),
            row=1,
            col=i + 1,
        )

        # print(len(DBT_df.loc[DBT_df["month"]==i+1,"hour"])/24)
        fig.update_xaxes(range=[0, 25], row=1, col=i + 1)
        fig.update_yaxes(range=range_y, row=1, col=i + 1)

    title = var_name + " (" + var_unit + ")"

    fig.update_xaxes(
        ticktext=["6", "12", "18"], tickvals=["6", "12", "18"], tickangle=0
    )

    fig.update_layout(template=template, dragmode=False, margin=tight_margins)
    return fig


@code_timer
def heatmap(df, var, global_local="global"):
    """General function that returns a heatmap."""
    var_unit = unit_dict[str(var) + "_unit"]
    var_range = range_dict[str(var) + "_range"]
    var_name = name_dict[str(var) + "_name"]
    var_color = color_dict[str(var) + "_color"]
    if global_local == "global":
        # Set Global values for Max and minimum
        range_z = var_range
    else:
        # Set maximum and minimum according to data
        data_max = 5 * ceil(df[var].max() / 5)
        data_min = 5 * floor(df[var].min() / 5)
        range_z = [data_min, data_max]

    fig = go.Figure(
        data=go.Heatmap(
            y=df["hour"],
            x=df["UTC_time"].dt.date,
            z=df[var],
            colorscale=var_color,
            zmin=range_z[0],
            zmax=range_z[1],
            customdata=np.stack((df["month_names"], df["day"]), axis=-1),
            hovertemplate=(
                "<b>"
                + var
                + ": %{z:.2f} "
                + var_unit
                + "</b><br>"
                + "Month: %{customdata[0]}<br>"
                + "Day: %{customdata[1]}<br>"
                + "Hour: %{y}:00<br>"
            ),
            name="",
            colorbar=dict(title=var_unit),
        )
    )

    title = var_name + " (" + var_unit + ")"

    fig.update_xaxes(dtick="M1", tickformat="%b", ticklabelmode="period")

    fig.update_yaxes(title_text="hours of the day")
    fig.update_xaxes(title_text="days of the year")

    fig.update_layout(template=template, margin=tight_margins, yaxis_nticks=13)
    fig.update_xaxes(showline=True, linewidth=1, linecolor="black", mirror=True)
    fig.update_yaxes(showline=True, linewidth=1, linecolor="black", mirror=True)

    return fig


### WIND ROSE TEMPLATE
def speed_labels(bins, units):
    """Return nice labels for a wind speed range."""
    labels = []
    for left, right in zip(bins[:-1], bins[1:]):
        if left == bins[0]:
            labels.append("calm")
        elif np.isinf(right):
            labels.append(">{} {}".format(left, units))
        else:
            labels.append("{} - {} {}".format(left, right, units))
    return labels


def wind_rose(df, meta, title, month, hour, labels):
    """Return the wind rose figure.

    Based on:  https://gist.github.com/phobson/41b41bdd157a2bcf6e14
    """
    start_month = month[0]
    end_month = month[1]
    start_hour = hour[0]
    end_hour = hour[1]
    if start_month <= end_month:
        df = df.loc[(df["month"] >= start_month) & (df["month"] <= end_month)]
    else:
        df = df.loc[(df["month"] <= end_month) | (df["month"] >= start_month)]
    if start_hour <= end_hour:
        df = df.loc[(df["hour"] >= start_hour) & (df["hour"] <= end_hour)]
    else:
        df = df.loc[(df["hour"] <= end_hour) | (df["hour"] >= start_hour)]

    spd_colors = color_dict["Wspeed_color"]
    spd_bins = [-1, 0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, np.inf]
    spd_labels = speed_labels(spd_bins, units="m/s")
    dir_bins = np.arange(-22.5 / 2, 370, 22.5)
    dir_labels = (dir_bins[:-1] + dir_bins[1:]) / 2
    total_count = df.shape[0]
    calm_count = df.query("Wspeed == 0").shape[0]
    rose = (
        df.assign(
            WindSpd_bins=lambda df: pd.cut(
                df["Wspeed"], bins=spd_bins, labels=spd_labels, right=True
            )
        )
        .assign(
            WindDir_bins=lambda df: pd.cut(
                df["Wdir"], bins=dir_bins, labels=dir_labels, right=False
            )
        )
        .replace({"WindDir_bins": {360: 0}})
        .groupby(by=["WindSpd_bins", "WindDir_bins"])
        .size()
        .unstack(level="WindSpd_bins")
        .fillna(0)
        .assign(calm=lambda df: calm_count / df.shape[0])
        .sort_index(axis=1)
        .applymap(lambda x: x / total_count * 100)
    )
    fig = go.Figure()
    for i, col in enumerate(rose.columns):
        fig.add_trace(
            go.Barpolar(
                r=rose[col],
                theta=360 - rose.index.categories,
                name=col,
                marker_color=spd_colors[i],
                hovertemplate="frequency: %{r:.2f}%"
                + "<br>"
                + "direction: %{theta:.2f}"
                + "\u00B0 deg"
                + "<br>",
            )
        )

    fig.update_traces(
        text=[
            "North",
            "N-N-E",
            "N-E",
            "E-N-E",
            "East",
            "E-S-E",
            "S-E",
            "S-S-E",
            "South",
            "S-S-W",
            "S-W",
            "W-S-W",
            "West",
            "W-N-W",
            "N-W",
            "N-N-W",
        ]
    )
    if title != "":
        fig.update_layout(title=title, title_x=0.5)
    fig.update_layout(
        autosize=True,
        polar_angularaxis_rotation=90,
        showlegend=labels,
        dragmode=False,
        margin=tight_margins,
    )
    fig.update_xaxes(showline=True, linewidth=1, linecolor="black", mirror=True)
    fig.update_yaxes(showline=True, linewidth=1, linecolor="black", mirror=True)

    return fig


def barchart(df, var, time_filter_info, data_filter_info, normalize):
    """Return the custom summary bar chart."""
    time_filter = time_filter_info[0]
    data_filter = data_filter_info[0]
    min_val = data_filter_info[2]
    max_val = data_filter_info[3]
    if len(time_filter_info) == 3:
        start_month = time_filter_info[1][0]
        end_month = time_filter_info[1][1]
        start_hour = time_filter_info[2][0]
        end_hour = time_filter_info[2][1]

        filter_var = data_filter_info[1]
        filter_name = str(filter_var) + "_name"
        filter_name = name_dict[filter_name]
        filter_unit = str(filter_var) + "_unit"
        filter_unit = unit_dict[filter_unit]

    var_unit = str(var) + "_unit"
    var_unit = unit_dict[var_unit]
    var_range = str(var) + "_range"
    var_range = range_dict[var_range]
    var_name = str(var) + "_name"
    var_name = name_dict[var_name]
    var_color = str(var) + "_color"
    var_color = color_dict[var_color]

    color_below = var_color[0]
    color_above = var_color[-1]
    color_in = var_color[len(var_color) // 2]

    new_df = df.copy()
    # if time_filter:
    #     if start_month <= end_month:
    #         new_df.loc[(new_df["month"] < start_month) | (new_df["month"] > end_month)]
    #     else:
    #         new_df.loc[
    #             (new_df["month"] >= end_month) & (new_df["month"] <= start_month)
    #         ]
    #     if start_hour <= end_hour:
    #         new_df.loc[(new_df["hour"] < start_hour) | (new_df["hour"] > end_hour)]
    #     else:
    #         new_df.loc[(df["hour"] >= end_hour) & (new_df["hour"] <= start_hour)]
    #
    # if data_filter:
    #     if min_val <= max_val:
    #         new_df.loc[(new_df[filter_var] < min_val) | (new_df[filter_var] > max_val)]
    #     else:
    #         new_df.loc[
    #             (new_df[filter_var] >= max_val) & (new_df[filter_var] <= min_val)
    #         ]
    month_in = []
    month_below = []
    month_above = []

    min_val = str(min_val)
    max_val = str(max_val)
    if len(time_filter_info) == 1:
        filter_var = str(var)
    else:
        filter_var = str(filter_var)

    for i in range(1, 13):
        query = (
            "month=="
            + str(i)
            + " and ("
            + filter_var
            + ">="
            + min_val
            + " and "
            + filter_var
            + "<="
            + max_val
            + ")"
        )
        a = new_df.query(query)["DOY"].count()
        month_in.append(a)
        query = "month==" + str(i) + " and (" + filter_var + "<" + min_val + ")"
        b = new_df.query(query)["DOY"].count()
        month_below.append(b)
        query = "month==" + str(i) + " and " + filter_var + ">" + max_val
        c = new_df.query(query)["DOY"].count()
        month_above.append(c)

    go.Figure()
    trace1 = go.Bar(
        x=list(range(0, 13)), y=month_in, name=" IN range", marker_color=color_in
    )
    trace2 = go.Bar(
        x=list(range(0, 13)),
        y=month_below,
        name=" BELOW range",
        marker_color=color_below,
    )
    trace3 = go.Bar(
        x=list(range(0, 13)),
        y=month_above,
        name=" ABOVE range",
        marker_color=color_above,
    )
    data = [trace2, trace1, trace3]

    fig = go.Figure(data=data)
    fig.update_layout(barmode="stack", dragmode=False)

    if normalize:
        title = (
            "Percentage of time the "
            + var_name
            + " is in the range "
            + min_val
            + " to "
            + max_val
            + " "
            + var_unit
        )
        fig.update_yaxes(title_text="%")
        fig.update_layout(title=title, barnorm="percent")
    else:
        title = (
            "Number of hours the "
            + var_name
            + " is in the range "
            + min_val
            + " to "
            + max_val
            + " "
            + var_unit
        )
        fig.update_yaxes(title_text="hours")
        fig.update_layout(title=title, barnorm="")
    if time_filter:
        title += (
            "<br>between the months of "
            + month_lst[start_month - 1]
            + " to "
            + month_lst[end_month - 1]
            + " and between "
            + str(start_hour)
            + ":00-"
            + str(end_hour)
            + ":00 hours"
        )
    if data_filter:
        title += (
            ",<br>when the "
            + filter_name
            + " is between "
            + str(min_val)
            + " and "
            + str(min_val)
            + filter_unit
        )
    return fig
